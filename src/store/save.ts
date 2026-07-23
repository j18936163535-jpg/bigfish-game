// =============================================================
// 大鱼吃小鱼 · 存档读写（plan.md §2.1 契约）
// localStorage 键名 SAVE_KEY（config.ts）；读写全程容错：
// 任何坏档（JSON 损坏 / 字段缺失 / 类型错误）→ 回退 freshSave 语义，
// 并尽量保留可挽救的合法字段。
// =============================================================
import { SAVE_KEY } from '../game/config';
import type { SaveData } from '../game/types';

/** 新档初始值：初始鱼 bubbles（蓝宝）默认解锁并选中。 */
export function freshSave(): SaveData {
  return {
    coins: 0,
    xp: 0,
    level: 1,
    shopUnlocked: false,
    runsCompleted: 0,
    items: {},
    unlockedFish: ['bubbles'],
    selectedFish: 'bubbles',
    discovered: [],
    bestScore: 0,
    totalEaten: 0,
    playSeconds: 0,
    muted: false,
  };
}

// ---------- 字段级清洗工具 ----------
function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function int(v: unknown, fallback: number, min = 0): number {
  return Math.max(min, Math.floor(num(v, fallback)));
}
function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}
function strArr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((x): x is string => typeof x === 'string'))];
}

/**
 * 把任意 JSON 值清洗成合法 SaveData。
 * 整体不是对象 → freshSave；部分字段坏 → 该字段回默认，其余保留。
 */
function sanitize(raw: unknown): SaveData {
  const base = freshSave();
  if (typeof raw !== 'object' || raw === null) return base;
  const o = raw as Record<string, unknown>;

  const items: Record<string, number> = {};
  if (typeof o.items === 'object' && o.items !== null) {
    for (const [k, v] of Object.entries(o.items as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
        items[k] = Math.floor(v);
      }
    }
  }

  const unlocked = strArr(o.unlockedFish);
  if (!unlocked.includes('bubbles')) unlocked.unshift('bubbles'); // 初始鱼保底

  const selected =
    typeof o.selectedFish === 'string' && unlocked.includes(o.selectedFish)
      ? o.selectedFish
      : base.selectedFish;

  return {
    coins: int(o.coins, base.coins),
    xp: int(o.xp, base.xp),
    level: int(o.level, base.level, 1),
    shopUnlocked: bool(o.shopUnlocked, base.shopUnlocked),
    runsCompleted: int(o.runsCompleted, base.runsCompleted),
    items,
    unlockedFish: unlocked,
    selectedFish: selected,
    discovered: strArr(o.discovered),
    bestScore: int(o.bestScore, base.bestScore),
    totalEaten: int(o.totalEaten, base.totalEaten),
    playSeconds: Math.max(0, num(o.playSeconds, base.playSeconds)),
    muted: bool(o.muted, base.muted),
  };
}

/** 读档；不存在或损坏时返回干净存档（坏档不传染）。 */
export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return freshSave();
    return sanitize(JSON.parse(raw));
  } catch {
    return freshSave();
  }
}

/** 写档；隐私模式/配额满等失败静默忽略（本局数据仅在内存，不崩溃）。 */
export function persistSave(s: SaveData): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    /* 写入失败可接受：游戏继续，下次启动回到旧档 */
  }
}
