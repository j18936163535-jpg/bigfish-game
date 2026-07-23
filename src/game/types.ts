// =============================================================
// 大鱼吃小鱼 · 契约类型单一来源（plan.md §2 逐字照抄，禁止偏离）
// 所有模块只准 import 本文件类型，不得在此写实现。
// =============================================================

export type Tier = 1|2|3|4|5|6|7|8;
export type Behavior = 'wander'|'flee'|'chase'|'dart'|'lazy';

export interface FishSpec {
  id: string; name: string;
  tier: Tier; size: number; speed: number;
  behavior: Behavior;
  sprite: string; facing: 'left'|'right';
  coins: number; score: number; xp: number;
  minPlayerTier: Tier; special?: 'rainbow';
  /** 图鉴一句话简介（QA 补充的小契约扩展，可选）。 */
  desc?: string;
}

export interface SkillDef {
  id: string; name: string; icon: string; desc: string;
  cooldown: number; duration?: number;
}

export interface PlayerFishSpec {
  id: string; name: string; title: string; desc: string;
  unlockLevel: number;
  sprite: string; facing: 'left'|'right';
  baseSize: number; baseSpeed: number;
  skill: SkillDef; passiveDesc?: string;
}

export interface PickupDef {
  id: string; name: string; icon: string; desc: string;
  weight: number; duration?: number;
}

export interface ShopItemDef {
  id: string; name: string; icon: string; desc: string;
  maxLevel: number; basePrice: number; growth: number;
}

export interface RunModifiers {
  startSizeMul: number; cdMul: number; coinMul: number; xpMul: number;
  speedMul: number; rainbowMul: number;
  startShield: number; shieldRespawn: number;
  startBombs: number; revives: number; comboWindowBonus: number;
}

export interface RunResult {
  score: number; coins: number; maxTier: Tier; kills: number;
  duration: number; cause: 'eaten'|'quit';
}

export type ChestRarity = 'wood'|'silver'|'gold'|'platinum'|'diamond';
export interface ChestReward { rarity: ChestRarity; coins: number; bonusXp: number; }

export interface SaveData {
  coins: number; xp: number; level: number;
  shopUnlocked: boolean; runsCompleted: number;
  items: Record<string, number>;
  unlockedFish: string[]; selectedFish: string;
  discovered: string[];
  bestScore: number; totalEaten: number; playSeconds: number;
  muted: boolean;
}

export interface HudState {
  score: number; coins: number; tier: Tier; progress: number;
  skill: { id: string; icon: string; cd: number; cdMax: number; active: boolean };
  buffs: { id: string; icon: string; remain: number }[];
  combo: { count: number; remain: number } | null;
  shield: number; bombs: number; revives: number;
  dead: boolean;
}

export type SfxName = 'eat'|'eatBig'|'coin'|'dash'|'skill'|'death'|'chest'
  |'chestOpen'|'ui'|'pickup'|'bomb'|'rainbow'|'levelup'|'unlock'
  |'shieldBreak'|'revive'|'combo'|'stun';

// =============================================================
// §2.1 模块 API 契约（存档备查；各模块在各自文件内实现，
// 此处仅作注释，避免跨文件重复声明）
// =============================================================
//
// // store/save.ts
// export function loadSave(): SaveData;
// export function persistSave(s: SaveData): void;
// export function freshSave(): SaveData;
//
// // store/economy.ts
// export function getRunModifiers(save: SaveData): RunModifiers;
// export function priceOf(item: ShopItemDef, ownedLevel: number): number; // base*growth^owned, 满级返回 Infinity
// export function xpNeed(level: number): number;          // 升到 level+1 所需: Math.round(100*Math.pow(level,1.5))
// export function settleRun(save: SaveData, r: RunResult): {
//   save: SaveData; xpGained: number; levelUps: number;
//   newFish: PlayerFishSpec[]; chest: ChestReward; justUnlockedShop: boolean;
// };
//
// // game/audio.ts
// export const audio: {
//   unlock(): void;                 // 首次用户手势调用(iOS 限制)
//   play(n: SfxName): void;
//   startBgm(): void; stopBgm(): void;
//   setMuted(m: boolean): void;
// };
//
// // game/engine/input.ts
// export class Joystick {
//   constructor(host: HTMLElement); // 在 host 内自建摇杆 DOM(半透明, ~96px)
//   readonly dx: number; readonly dy: number; readonly active: boolean;
//   destroy(): void;
// }
//
// // game/render/fishRenderer.ts
// export class FishRenderer {
//   constructor();
//   preload(specs: {sprite: string}[]): Promise<void>;
//   draw(ctx: CanvasRenderingContext2D, spec: FishSpec|PlayerFishSpec,
//        x: number, y: number, size: number, dirX: number, t: number,
//        opts?: {rainbow?: boolean; alpha?: number}): void;
//   // 内部: 图片加载成功→画 PNG(按 facing 翻转+正弦摆动); 失败→程序化矢量鱼兜底
// }
//
// // game/scene/GameScene.ts
// export class GameScene {
//   constructor(opts: {
//     canvas: HTMLCanvasElement;
//     player: PlayerFishSpec; mods: RunModifiers;
//     joystickHost: HTMLElement;
//     onHud: (h: HudState) => void;
//     onEnd: (r: RunResult) => void;
//     onDiscover: (fishId: string) => void;
//   });
//   start(): void; destroy(): void;
//   useSkill(): void; useBomb(): void;
//   setPaused(p: boolean): void;
// }
