// =============================================================
// ai.ts — NPC 行为 AI（plan §3 行为语义）
//  wander = 随机游；flee = 玩家(比它大)靠近就逃；
//  chase = 比它小的进入感知圈(≈420px)就追，并带"潜伏-冲刺"杀招；
//  dart  = 间歇突进；lazy = 慢漂。
// 潜伏-冲刺（chase 型与捕食性 dart 共用状态机）：
//  常态追击克制 → 进触发距离且大致对准时 0.35-0.5s 前摇（减速蓄力，
//  渲染层抖动/变亮 + 'stun' 音）→ 2.5-3.2× 速度冲向"预判锁定点"
//  0.6-1s → 1.5-3s 疲惫（逃跑窗口）。tier/难度越高：预判越准、
//  冲刺越频、前摇越短。冲刺追不上 dash 中的玩家（可走位/技能躲）。
// 叠加状态：stun 麻痹 / scared 受惊逃跑 / 漩涡吸入 / 磁铁吸引 / 诱光 / 沙漏减速。
// =============================================================
import type { Npc } from './spawner';
import { audio } from '../audio';

export interface AiCtx {
  px: number; py: number;       // 玩家世界坐标
  pvx: number; pvy: number;     // 玩家速度（冲刺预判用）
  playerSize: number;           // 玩家有效碰撞半径（含被动修正）
  playerVisible: boolean;       // 隐身技能期间为 false（大鱼完全丢失目标）
  canPlayerEat: (n: Npc) => boolean;
  lure: number;                 // >0：诱光半径（可吃鱼被吸引游向玩家）
  magnet: number;               // >0：磁铁半径（可吃的小鱼被吸向玩家，入口即被吃）
  vortex: number;               // >0：吞噬漩涡半径（可吃鱼被直接吸入）
  hourglass: boolean;           // 沙漏：全场鱼速 -55%
  chaseRange: number;           // chase 感知圈（≈420px，由场景按宽限/tier/难度缩放）
  grace: boolean;               // 开局宽限期：chase 不追不冲、危险 dart 几乎不瞄准
  earlyCalm: boolean;           // 开局 30s 宽限：危险鱼近身轻绕开（不撞脸送人头，但仍环绕施压）
  predAim: number;              // 危险 dart 鱼瞄准玩家的概率（宽限期≈0，随难度爬坡）
  diff: number;                 // 连续难度标量 0→1（冲刺频率/速度/前摇/预判）
}

/** 平滑转向（最短弧插值） */
const turn = (cur: number, target: number, rate: number, dt: number): number => {
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return cur + d * Math.min(1, rate * dt);
};

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** 冲刺倍率：2.6-3.6×，tier 与难度越高越快（用户要求难度翻倍：端点 3.2→3.6） */
const lungeMul = (n: Npc, diff: number): number =>
  Math.min(3.6, 2.6 + 0.1 * (n.spec.tier - 1) + 0.5 * diff);

/** 冲刺冷却：难度/tier 越高冲得越频（难度翻倍：4.5-2.2D→3.6-2.4D，下限 1.2→0.9） */
const lungeCooldown = (n: Npc, diff: number, rand: () => number): number =>
  Math.max(0.9, 3.6 - 2.4 * diff - 0.3 * (n.spec.tier - 1)) + rand() * 0.6;

export function updateNpc(n: Npc, dt: number, c: AiCtx, rand: () => number): void {
  // 击退速度持续衰减
  n.vx *= Math.max(0, 1 - 4 * dt);
  n.vy *= Math.max(0, 1 - 4 * dt);

  // 麻痹：僵直原地，仅随击退漂移
  if (n.stun > 0) {
    n.stun -= dt;
    n.x += n.vx * dt;
    n.y += n.vy * dt;
    n.phase += dt * 1.5;
    return;
  }

  const dx = c.px - n.x;
  const dy = c.py - n.y;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  const edible = c.canPlayerEat(n);

  // 吞噬漩涡：可吃鱼被直接吸向玩家（覆盖一切行为）
  if (c.vortex > 0 && edible && dist < c.vortex) {
    const sp = 640;
    n.x += (ux * sp + n.vx) * dt;
    n.y += (uy * sp + n.vy) * dt;
    n.dir = Math.atan2(uy, ux);
    n.phase += dt * 10;
    return;
  }

  // 磁铁：可吃的小鱼被吸向玩家（根因修复：原条件只看 tier≤2，
  // 不可吃的鱼被吸到玩家身上永远吃不掉还会跑掉；现在只吸可吃鱼，
  // 且越近吸得越快，进吞食判定圈立刻被 contacts() 吃掉）
  if (c.magnet > 0 && edible && dist < c.magnet) {
    const pull = 280 + (1 - Math.min(1, dist / c.magnet)) * 260;
    n.x += (ux * pull + n.vx) * dt;
    n.y += (uy * pull + n.vy) * dt;
    n.dir = Math.atan2(uy, ux);
    n.phase += dt * 6;
    return;
  }

  // ---- 潜伏-冲刺状态机（自主行为最高优先级）----
  if (n.lungeT > 0) {
    // 冲刺：锁定预判点高速突进（转向快但只追锁定点，可走位闪开）
    n.lungeT -= dt;
    const adx = n.aimX - n.x;
    const ady = n.aimY - n.y;
    const ad = Math.hypot(adx, ady) || 1;
    let sp = n.spec.speed * lungeMul(n, c.diff);
    if (c.hourglass) sp *= 0.45;
    n.dir = turn(n.dir, Math.atan2(ady, adx), 12, dt);
    n.x += (Math.cos(n.dir) * sp + n.vx) * dt;
    n.y += (Math.sin(n.dir) * sp + n.vy) * dt;
    n.phase += dt * (2 + sp * 0.03);
    if (n.lungeT <= 0 || ad < n.size * 0.7 + 14) {
      n.lungeT = 0;
      n.fatigueT = 1.5 + rand() * 1.5;   // 疲惫期=玩家逃跑窗口
      n.lungeCd = lungeCooldown(n, c.diff, rand);
    }
    return;
  }
  if (n.windupT > 0) {
    // 前摇：减速蓄力（渲染层抖动/变亮），结束瞬间锁定预判点
    n.windupT -= dt;
    let sp = n.spec.speed * 0.3;
    if (c.hourglass) sp *= 0.45;
    n.phase += dt * 14;
    n.x += (Math.cos(n.dir) * sp + n.vx) * dt;
    n.y += (Math.sin(n.dir) * sp + n.vy) * dt;
    if (n.windupT <= 0) {
      const pd = Math.hypot(c.px - n.x, c.py - n.y) || 1;
      const lead = clamp(pd / (n.spec.speed * 2.8), 0, 0.6)
        * clamp(0.4 + 0.08 * (n.spec.tier - 1), 0, 1)
        * (0.7 + 0.3 * c.diff);
      n.aimX = c.px + c.pvx * lead;
      n.aimY = c.py + c.pvy * lead;
      n.lungeT = 0.6 + rand() * 0.4;
    }
    return;
  }
  if (n.fatigueT > 0) {
    // 疲惫：慢速漂流，不吃不吃追，玩家的逃跑/反打窗口
    n.fatigueT -= dt;
    let sp = n.spec.speed * 0.45;
    if (c.hourglass) sp *= 0.45;
    n.stateT -= dt;
    if (n.stateT <= 0) {
      n.stateT = 1 + rand() * 2;
      n.tdir = rand() * Math.PI * 2;
    }
    n.dir = turn(n.dir, n.tdir, 2.5, dt);
    n.x += (Math.cos(n.dir) * sp + n.vx) * dt;
    n.y += (Math.sin(n.dir) * sp + n.vy) * dt;
    n.phase += dt * 2;
    return;
  }

  // 开局宽限贴身绕行：危险鱼漂移/游荡快撞上玩家时沿切向绕开
  // （宽限期可见、环绕、施压，但不给"不知道怎么死"的漂移杀）
  if (c.earlyCalm && c.playerVisible && c.playerSize < n.size
      && dist < n.size + c.playerSize + 46 + n.spec.speed * 0.25) {
    let sp = n.spec.speed * 0.7;
    if (c.hourglass) sp *= 0.45;
    const side = (n.id % 2 === 0 ? 1 : -1); // 每鱼固定绕行方向，避免抖动
    n.tdir = Math.atan2(uy, ux) + side * Math.PI * 0.55;
    n.dir = turn(n.dir, n.tdir, 4, dt);
    n.x += (Math.cos(n.dir) * sp + n.vx) * dt;
    n.y += (Math.sin(n.dir) * sp + n.vy) * dt;
    n.phase += dt * 3;
    return;
  }

  let speed = n.spec.speed;
  let turnRate = 3.5;

  const wander = (mul: number): void => {
    n.stateT -= dt;
    if (n.stateT <= 0) {
      n.stateT = 1.6 + rand() * 3.2;
      // 危险鱼游荡带"盯梢"偏好：25% 概率朝玩家侧向环绕游（切向），
      // 保证威胁常在场边徘徊而不是漂走，也不直接撞脸送人头
      if (!c.grace && c.playerVisible && c.playerSize < n.size && dist < 800 && rand() < 0.25) {
        n.tdir = Math.atan2(uy, ux) + (rand() < 0.5 ? -1 : 1) * (0.5 + rand() * 0.7);
      } else {
        n.tdir = rand() * Math.PI * 2;
      }
    }
    speed *= mul;
  };

  if (n.scared > 0) {
    // 受惊（棘刺弹开 / 护盾震开 / 炸弹余波）：背离玩家逃跑
    n.scared -= dt;
    n.tdir = Math.atan2(-uy, -ux);
    speed *= 1.5;
    turnRate = 6;
  } else if (c.lure > 0 && edible && dist < c.lure) {
    // 诱光：可吃鱼被吸引游向玩家
    n.tdir = Math.atan2(uy, ux);
    speed *= 1.2;
  } else {
    switch (n.spec.behavior) {
      case 'wander':
        wander(0.55);
        break;
      case 'lazy':
        wander(0.28);
        break;
      case 'flee':
        if (c.playerVisible && edible && dist < 340) {
          n.tdir = Math.atan2(-uy, -ux);
          speed *= 1.45;   // 更会逃：吃它也需要技巧
          turnRate = 6.5;
        } else {
          wander(0.5);
        }
        break;
      case 'chase':
        if (!c.grace && c.playerVisible && c.playerSize < n.size && dist < c.chaseRange) {
          // 常态追击克制（杀招在潜伏-冲刺），压迫感随 tier 渐强
          n.tdir = Math.atan2(uy, ux);
          speed *= 0.92 + 0.01 * (n.spec.tier - 1);
          turnRate = 5.5;
          // 潜伏-冲刺触发：进触发距离 + 大致对准 + 冷却就绪
          n.lungeCd -= dt;
          if (n.lungeCd <= 0 && dist < c.chaseRange * 0.75) {
            let hd = Math.atan2(uy, ux) - n.dir;
            while (hd > Math.PI) hd -= Math.PI * 2;
            while (hd < -Math.PI) hd += Math.PI * 2;
            if (Math.abs(hd) < 1.0) {
              n.windupT = Math.max(0.35, 0.5 - 0.03 * (n.spec.tier - 1) - 0.12 * c.diff);
              audio.play('stun'); // 前摇提示音（既有 SfxName）
            }
          }
        } else if (c.playerVisible && edible && dist < 260) {
          // 玩家反过来比它大且贴近 → 逃
          n.tdir = Math.atan2(-uy, -ux);
          speed *= 1.3;
          turnRate = 6;
        } else {
          wander(0.6);
        }
        break;
      case 'dart':
        n.dartT -= dt;
        if (n.dartT <= 0) {
          n.dartT = 1.6 + rand() * 2.4;
          if (c.earlyCalm && !edible) break; // 宽限期危险 dart 不突进（环绕施压但不漂移杀）
          const r = rand();
          if (c.playerVisible && !edible && dist < 520 && r < c.predAim) {
            // 捕食突进：先短前摇再冲预判点（公平可躲，压迫随难度爬坡）
            n.windupT = Math.max(0.3, 0.42 - 0.1 * c.diff);
            audio.play('stun');
          } else if (edible && c.playerVisible && dist < 260 && r < 0.55) {
            // 被追逃窜：贴身时高概率径直弹离玩家（吃它需要技巧）
            n.stateT = 0.45;
            n.tdir = Math.atan2(-uy, -ux);
          } else if (edible && c.playerVisible && dist < 520 && r < 0.35 + 0.35 * (1 - c.diff)) {
            // 可吃的小鱼突进有几率冲向玩家（送上门；难度越高越不肯送）
            n.stateT = 0.45;
            n.tdir = Math.atan2(uy, ux);
          } else {
            n.stateT = 0.45;
            n.tdir = rand() * Math.PI * 2;
          }
        }
        if (n.stateT > 0) {
          n.stateT -= dt;
          speed *= 2.4;
          turnRate = 8;
        } else {
          speed *= 0.5;
        }
        break;
    }
  }

  if (c.hourglass) speed *= 0.45; // 沙漏：全场鱼速 -55%

  n.dir = turn(n.dir, n.tdir, turnRate, dt);
  n.x += (Math.cos(n.dir) * speed + n.vx) * dt;
  n.y += (Math.sin(n.dir) * speed + n.vy) * dt;
  n.phase += dt * (2 + speed * 0.02);
}
