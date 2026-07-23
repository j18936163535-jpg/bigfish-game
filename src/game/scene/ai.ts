// =============================================================
// ai.ts — NPC 行为 AI（plan §3 行为语义）
//  wander = 随机游；flee = 玩家(比它大)靠近就逃；
//  chase = 比它小的进入感知圈(≈420px)就追；
//  dart  = 间歇突进；lazy = 慢漂。
// 叠加状态：stun 麻痹 / scared 受惊逃跑 / 漩涡吸入 / 磁铁吸引 / 诱光 / 沙漏减速。
// =============================================================
import type { Npc } from './spawner';

export interface AiCtx {
  px: number; py: number;       // 玩家世界坐标
  playerSize: number;           // 玩家有效碰撞半径（含被动修正）
  playerVisible: boolean;       // 隐身技能期间为 false（大鱼完全丢失目标）
  canPlayerEat: (n: Npc) => boolean;
  lure: number;                 // >0：诱光半径（可吃鱼被吸引游向玩家）
  magnet: number;               // >0：磁铁半径（1-2 档小鱼被吸向玩家）
  vortex: number;               // >0：吞噬漩涡半径（可吃鱼被直接吸入）
  hourglass: boolean;           // 沙漏：全场鱼速 -55%
  chaseRange: number;           // chase 感知圈（≈420px）
}

/** 平滑转向（最短弧插值） */
const turn = (cur: number, target: number, rate: number, dt: number): number => {
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return cur + d * Math.min(1, rate * dt);
};

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

  // 磁铁：1-2 档小鱼被吸向玩家
  if (c.magnet > 0 && n.spec.tier <= 2 && dist < c.magnet) {
    n.x += (ux * 280 + n.vx) * dt;
    n.y += (uy * 280 + n.vy) * dt;
    n.dir = Math.atan2(uy, ux);
    n.phase += dt * 6;
    return;
  }

  let speed = n.spec.speed;
  let turnRate = 3.5;

  const wander = (mul: number): void => {
    n.stateT -= dt;
    if (n.stateT <= 0) {
      n.stateT = 1.6 + rand() * 3.2;
      n.tdir = rand() * Math.PI * 2;
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
        if (c.playerVisible && edible && dist < 300) {
          n.tdir = Math.atan2(-uy, -ux);
          speed *= 1.35;
          turnRate = 6;
        } else {
          wander(0.5);
        }
        break;
      case 'chase':
        if (c.playerVisible && c.playerSize < n.size && dist < c.chaseRange) {
          // 比它小的进入感知圈 → 追击
          n.tdir = Math.atan2(uy, ux);
          speed *= 1.12;
          turnRate = 5.5;
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
          n.dartT = 1.8 + rand() * 2.6;
          n.stateT = 0.45; // 突进窗口
          n.tdir = (c.playerVisible && dist < 520 && rand() < 0.5)
            ? Math.atan2(uy, ux)
            : rand() * Math.PI * 2;
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
