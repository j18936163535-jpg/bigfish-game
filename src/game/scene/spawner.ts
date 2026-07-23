// =============================================================
// spawner.ts — NPC 实体定义与按玩家 tier 加权的生成器
// plan §3 生成语义：
//  - 主要刷新 minPlayerTier ≤ 玩家 tier 的鱼；
//  - 大鱼（tier > 玩家）要有但克制（同屏上限 BIG_CAP，权重低）；
//  - 彩虹鱼权重 = RAINBOW_BASE_WEIGHT × mods.rainbowMul（极低）。
// 假定导出已对齐内容代理实际实现：data/fish.ts 导出 fish: FishSpec[]
// =============================================================
import { fish } from '../data/fish';
import { RAINBOW_BASE_WEIGHT } from '../config';
import type { FishSpec, Tier } from '../types';

export interface Npc {
  id: number;
  spec: FishSpec;
  x: number; y: number;
  size: number;          // 碰撞半径（spec.size × 个体浮动）
  dir: number;           // 当前航向（弧度）
  tdir: number;          // 目标航向
  phase: number;         // 摆动/动画相位
  stateT: number;        // 行为计时（漫游换向 / 突进窗口）
  dartT: number;         // 突进间隔计时
  stun: number;          // 麻痹剩余秒数
  scared: number;        // 受惊强制逃跑剩余秒数
  windupT: number;       // 潜伏-冲刺：前摇剩余秒数（>0 减速蓄力）
  lungeT: number;        // 冲刺剩余秒数（>0 锁定预判点突进）
  fatigueT: number;      // 冲后疲惫剩余秒数（逃跑窗口）
  lungeCd: number;       // 距下次可冲刺的冷却
  aimX: number; aimY: number; // 冲刺锁定的预判目标点
  vx: number; vy: number; // 击退速度（衰减）
  eaten: number;         // -1 = 存活；0..1 = 被吸入口中动画进度
  fromX: number; fromY: number; // 吸入动画起点
  dead: boolean;
}

let nextNpcId = 1;

export interface MakeNpcOpts {
  minMul?: number; // 体型浮动下限（默认 0.85）
  maxMul?: number; // 体型浮动上限（默认 1.15）
}

export function makeNpc(spec: FishSpec, x: number, y: number, opts?: MakeNpcOpts): Npc {
  const lo = opts?.minMul ?? 0.85;
  const hi = opts?.maxMul ?? 1.15;
  const dir = Math.random() * Math.PI * 2;
  return {
    id: nextNpcId++,
    spec, x, y,
    size: spec.size * (lo + Math.random() * (hi - lo)),
    dir, tdir: dir,
    phase: Math.random() * Math.PI * 2,
    stateT: 1 + Math.random() * 2,
    dartT: 1 + Math.random() * 2,
    stun: 0, scared: 0, vx: 0, vy: 0,
    windupT: 0, lungeT: 0, fatigueT: 0,
    lungeCd: 1.5 + Math.random() * 3,
    aimX: x, aimY: y,
    eaten: -1, fromX: x, fromY: y,
    dead: false,
  };
}

/**
 * 混合生成表（难度设计师重做）：约 55% 可吃 / 25% 同档争抢 / 20% 威胁。
 * 威胁占比由 threatShare 控制（场景按难度标量 D 在 0.12-0.22 间浮动），
 * 同屏威胁数达 threatCap 后普通生成不再出大鱼（威胁由场景定向补刷保底）。
 */
export interface PickSpecOpts {
  playerTier: Tier;
  threatCount: number;
  threatCap: number;
  threatShare: number;   // 威胁桶目标占比（0.12-0.22）
  rainbowMul: number;
  randFn?: () => number;
}

export function pickSpec(o: PickSpecOpts): FishSpec | null {
  const randFn = o.randFn ?? Math.random;
  const pool: { spec: FishSpec; w: number }[] = [];
  let total = 0;
  const threatW = 0.9 * Math.max(0, o.threatShare) / 0.2; // D=满 → 每桶条约 0.9
  for (const spec of fish) {
    let w = 0;
    if (spec.special === 'rainbow') {
      w = RAINBOW_BASE_WEIGHT * Math.max(0, o.rainbowMul);
    } else {
      if (spec.minPlayerTier > o.playerTier + 1) continue;
      const d = spec.tier - o.playerTier;
      if (d < 0) {
        w = d >= -2 ? 1.8 : 1.2;                 // 可吃桶
      } else if (d === 0) {
        w = 1.3;                                  // 同档争抢桶
      } else {
        if (o.threatCount >= o.threatCap) continue; // 威胁桶
        w = threatW * (d === 1 ? 1 : 0.6);
      }
    }
    if (w > 0) { pool.push({ spec, w }); total += w; }
  }
  if (total <= 0) return null;
  let r = randFn() * total;
  for (const e of pool) {
    r -= e.w;
    if (r <= 0) return e.spec;
  }
  return pool[pool.length - 1].spec;
}

/**
 * 定向抽一条"危险鱼"（比玩家大 1-2 档），用于威胁常存保底。
 * chase/dart 型权重更高（真的会追），温顺巨物低权重兜底。
 */
export function pickThreatSpec(
  playerTier: Tier,
  randFn: () => number = Math.random,
): FishSpec | null {
  const pool: { spec: FishSpec; w: number }[] = [];
  let total = 0;
  for (const spec of fish) {
    if (spec.special === 'rainbow') continue;
    if (spec.minPlayerTier > playerTier + 1) continue;
    const d = spec.tier - playerTier;
    if (d !== 1 && d !== 2) continue;
    const w = spec.behavior === 'chase' ? 3
      : spec.behavior === 'dart' ? 2 : 1;
    pool.push({ spec, w: w * (d === 1 ? 1 : 0.55) });
    total += w * (d === 1 ? 1 : 0.55);
  }
  if (total <= 0) return null;
  let r = randFn() * total;
  for (const e of pool) {
    r -= e.w;
    if (r <= 0) return e.spec;
  }
  return pool[pool.length - 1].spec;
}
