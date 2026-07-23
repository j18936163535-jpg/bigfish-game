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
    eaten: -1, fromX: x, fromY: y,
    dead: false,
  };
}

/** 同屏大鱼（tier > 玩家）数量上限：制造压迫感但克制 */
export const BIG_CAP = 3;

export function countBig(npcs: Npc[], playerTier: Tier): number {
  let c = 0;
  for (const n of npcs) {
    if (!n.dead && n.eaten < 0 && n.spec.tier > playerTier) c++;
  }
  return c;
}

/**
 * 按玩家 tier 加权抽取一个要生成的鱼种。
 * 权重设计（相对权重）：
 *  - 同级鱼 7；低 1/2/3 档 4/3/2（保底 2）；
 *  - 高 1 档 1.1、高 ≥2 档 0.35，且同屏大鱼达 BIG_CAP 后不再生成；
 *  - minPlayerTier > 玩家 tier + 1 的鱼不出现（龙王不会在浅海刷出）；
 *  - 彩虹鱼 = RAINBOW_BASE_WEIGHT × rainbowMul。
 */
export function pickSpec(
  playerTier: Tier,
  bigCount: number,
  rainbowMul: number,
  randFn: () => number = Math.random,
): FishSpec | null {
  const pool: { spec: FishSpec; w: number }[] = [];
  let total = 0;
  for (const spec of fish) {
    let w = 0;
    if (spec.special === 'rainbow') {
      w = RAINBOW_BASE_WEIGHT * Math.max(0, rainbowMul);
    } else {
      if (spec.minPlayerTier > playerTier + 1) continue;
      const d = spec.tier - playerTier;
      if (d <= 0) {
        w = d === 0 ? 7 : Math.max(2, 5 + d);
      } else {
        if (bigCount >= BIG_CAP) continue;
        w = d === 1 ? 1.1 : 0.35;
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
