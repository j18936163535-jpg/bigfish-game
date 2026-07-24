// =============================================================
// 大鱼吃小鱼 · 经济系统（plan.md §2.1 契约 + §5 数值）
// 经验/升级/解锁鱼/宝箱档位/商品价格/局内修饰符汇总。
// 契约外补充了几个便捷函数（tryBuyItem / selectFish / setMuted /
// addDiscovered / chestForScore），供 UI 与集成者直接使用，见 ui/README.md。
// =============================================================
import { playerFish } from '../game/data/playerFish';
import type {
  ChestRarity,
  ChestReward,
  PlayerFishSpec,
  RunModifiers,
  RunResult,
  SaveData,
  ShopItemDef,
} from '../game/types';
import { persistSave } from './save';

/** 商品价格：base × growth^已购级；满级返回 Infinity（契约 §2.1）。 */
export function priceOf(item: ShopItemDef, ownedLevel: number): number {
  if (ownedLevel >= item.maxLevel) return Infinity;
  return Math.round(item.basePrice * Math.pow(item.growth, ownedLevel));
}

/** 从 level 升到 level+1 所需经验（契约 §2.1）。 */
export function xpNeed(level: number): number {
  return Math.round(100 * Math.pow(level, 1.5));
}

/** 读取某商品已购等级（未购为 0）。 */
const lv = (save: SaveData, id: string): number => save.items[id] ?? 0;

/**
 * 按商店已购商品汇总局内修饰符（plan.md §5 商品表）。
 * 等级按各商品 maxLevel 截断，防止坏档数据溢出。
 */
export function getRunModifiers(save: SaveData): RunModifiers {
  const bubble = Math.min(3, lv(save, 'bubble'));
  return {
    startSizeMul: 1 + 0.06 * Math.min(5, lv(save, 'fry')),
    cdMul: 1 - 0.06 * Math.min(5, lv(save, 'turbo')),
    coinMul: 1 + 0.1 * Math.min(5, lv(save, 'mag')),
    xpMul: 1 + 0.12 * Math.min(5, lv(save, 'brain')),
    speedMul: 1 + 0.04 * Math.min(5, lv(save, 'fin')),
    rainbowMul: 1 + 0.35 * Math.min(3, lv(save, 'bait')),
    startShield: bubble >= 1 ? 1 : 0,
    shieldRespawn: bubble >= 3 ? 30 : bubble === 2 ? 60 : 0,
    startBombs: Math.min(2, lv(save, 'belt')),
    revives: Math.min(2, lv(save, 'totem')),
    comboWindowBonus: 0.6 * Math.min(3, lv(save, 'chain')),
    // 第三轮新增商品
    growMul: 1 + 0.08 * Math.min(5, lv(save, 'appetite')),
    pickupDurationMul: 1 + 0.15 * Math.min(3, lv(save, 'scavenger')),
    pickupRateMul: 1 + 0.2 * Math.min(3, lv(save, 'sonar')),
    chestMul: 1 + 0.15 * Math.min(3, lv(save, 'luck')),
    comboCoinMul: 1 + 0.3 * Math.min(3, lv(save, 'greed')),
    toughness: 0.05 * Math.min(3, lv(save, 'tough')),
    dashPowerMul: 1 + 0.12 * Math.min(3, lv(save, 'wake')),
    skillDurMul: 1 + 0.15 * Math.min(3, lv(save, 'endure')),
  };
}

// ---------- 宝箱（plan.md §5：按分数定档，金币区间内随机，bonusXp=金币/2） ----------
const CHEST_TABLE: ReadonlyArray<{
  rarity: ChestRarity;
  minScore: number; // score ≥ minScore 即该档（表按高到低排列，取首个命中）
  coinMin: number;
  coinMax: number;
}> = [
  { rarity: 'diamond', minScore: 2800, coinMin: 380, coinMax: 620 }, // 500±120
  { rarity: 'platinum', minScore: 1600, coinMin: 200, coinMax: 320 }, // 260±60
  { rarity: 'gold', minScore: 800, coinMin: 100, coinMax: 180 }, // 140±40
  { rarity: 'silver', minScore: 300, coinMin: 50, coinMax: 90 }, // 70±20
  { rarity: 'wood', minScore: 0, coinMin: 20, coinMax: 40 }, // 30±10
];

/** 按本局分数生成宝箱奖励（结算与预览共用）。 */
export function chestForScore(score: number): ChestReward {
  const row =
    CHEST_TABLE.find((c) => score >= c.minScore) ??
    CHEST_TABLE[CHEST_TABLE.length - 1];
  const coins =
    row.coinMin + Math.floor(Math.random() * (row.coinMax - row.coinMin + 1));
  return { rarity: row.rarity, coins, bonusXp: Math.round(coins / 2) };
}

export interface SettleResult {
  save: SaveData;
  xpGained: number;
  levelUps: number;
  newFish: PlayerFishSpec[];
  chest: ChestReward;
  justUnlockedShop: boolean;
}

/**
 * 结算一局（契约 §2.1）：
 * - xpGained = round(score×0.6 + duration×2 + maxTier×15) × xpMul
 * - 宝箱金币与 bonusXp 直接入账并计入升级经验
 * - 升级即时解锁新初始鱼（unlockedFish 追加，newFish 返回）
 * - runsCompleted≥1 → shopUnlocked；justUnlockedShop 仅本次转变为 true
 * - bestScore / totalEaten / playSeconds 在此维护
 * 返回的新存档已持久化（persistSave）。
 */
export function settleRun(save: SaveData, r: RunResult): SettleResult {
  const mods = getRunModifiers(save);
  const xpGained = Math.round(
    (r.score * 0.6 + r.duration * 2 + r.maxTier * 15) * mods.xpMul,
  );
  const chest = chestForScore(r.score);
  // 幸运鳞：宝箱金币与附带经验 +15%/级
  chest.coins = Math.round(chest.coins * mods.chestMul);
  chest.bonusXp = Math.round(chest.coins / 2);

  const next: SaveData = {
    ...save,
    items: { ...save.items },
    unlockedFish: [...save.unlockedFish],
    discovered: [...save.discovered],
  };
  next.coins = save.coins + Math.max(0, Math.round(r.coins)) + chest.coins;
  next.runsCompleted = save.runsCompleted + 1;
  const justUnlockedShop = !save.shopUnlocked && next.runsCompleted >= 1;
  next.shopUnlocked = save.shopUnlocked || justUnlockedShop;
  next.bestScore = Math.max(save.bestScore, r.score);
  next.totalEaten = save.totalEaten + Math.max(0, Math.round(r.kills));
  next.playSeconds = save.playSeconds + Math.max(0, r.duration);

  // 经验与升级（循环吃经验，可连升）
  let xp = save.xp + xpGained + chest.bonusXp;
  let level = save.level;
  let levelUps = 0;
  while (xp >= xpNeed(level)) {
    xp -= xpNeed(level);
    level += 1;
    levelUps += 1;
  }
  next.xp = xp;
  next.level = level;

  const newFish = playerFish.filter(
    (f) => f.unlockLevel <= level && !save.unlockedFish.includes(f.id),
  );
  next.unlockedFish = [...save.unlockedFish, ...newFish.map((f) => f.id)];

  persistSave(next);
  return { save: next, xpGained, levelUps, newFish, chest, justUnlockedShop };
}

// =============================================================
// 契约外的本地补充（UI 用便捷函数；均自带持久化）
// =============================================================

/** 购买一件商品：扣款 + 等级+1；金币不足或满级返回 ok:false 且存档原样。 */
export function tryBuyItem(
  save: SaveData,
  item: ShopItemDef,
): { save: SaveData; ok: boolean } {
  const owned = save.items[item.id] ?? 0;
  const price = priceOf(item, owned);
  if (!Number.isFinite(price) || save.coins < price) {
    return { save, ok: false };
  }
  const next: SaveData = {
    ...save,
    coins: save.coins - price,
    items: { ...save.items, [item.id]: owned + 1 },
  };
  persistSave(next);
  return { save: next, ok: true };
}

/** 选择初始鱼（仅已解锁可选中）。 */
export function selectFish(save: SaveData, fishId: string): SaveData {
  if (!save.unlockedFish.includes(fishId)) return save;
  const next = { ...save, selectedFish: fishId };
  persistSave(next);
  return next;
}

/** 静音开关持久化。 */
export function setMutedFlag(save: SaveData, muted: boolean): SaveData {
  if (save.muted === muted) return save;
  const next = { ...save, muted };
  persistSave(next);
  return next;
}

/** 图鉴发现登记（幂等）。 */
export function addDiscovered(save: SaveData, fishId: string): SaveData {
  if (save.discovered.includes(fishId)) return save;
  const next = { ...save, discovered: [...save.discovered, fishId] };
  persistSave(next);
  return next;
}
