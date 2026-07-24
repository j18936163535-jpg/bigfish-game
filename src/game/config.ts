// =============================================================
// 大鱼吃小鱼 · 全局数值表（plan.md §6 逐字照抄）
// =============================================================
import type { Tier } from './types';

export const TIER_SIZE: Record<Tier, number> = {1:12,2:20,3:33,4:54,5:89,6:147,7:243,8:400};
export const RAINBOW_DURATION = 10;
export const COMBO_WINDOW = 3;
export const EAT_RATIO = 0.95;     // 可吃: prey.size < my.size*EAT_RATIO（QA 0.9→0.95：T1 开局口粮不再稀缺）
export const DANGER_RATIO = 1.15;  // 危险: size > my.size*DANGER_RATIO
export const SPAWN_AHEAD = 900;    // 生成环最小半径（实际生成环随视野动态外推，见 scene）
export const MAX_NPC = 70;         // 同屏上限（密度按可见区维持后上调）
export const RAINBOW_BASE_WEIGHT = 0.35; // 相对权重, 极低
export const SAVE_KEY = 'bigfish.save.v1';

// QA 平衡（起步宽限）：开局 GRACE_PERIOD 秒内 chase 鱼不主动追、
// 大型 dart 鱼不瞄准玩家；宽限结束后压迫感在 GRACE_RAMP 秒内
// 从低位爬坡到满值，并随玩家 tier 提升继续增强（见 scene）。
export const GRACE_PERIOD = 10;    // 开局宽限秒数（难度翻倍：12→10）
export const GRACE_RAMP = 30;      // 宽限后压迫感爬坡时长(s)（难度翻倍：45→30）

// 成长框架（plan.md §6 末段）：
// 吃 tier t 的鱼得质量 m = size²×0.12；玩家当前质量达 TIER_SIZE[t+1]²×3 时升档
// （体型平滑插值到下一档）。玩法代理在此框架内微调，
// 但必须保证 3-6 分钟一局能到 tier 4-5。
export const MASS_PER_SIZE_SQ = 0.12;   // m = size²×0.12
export const TIER_UP_MASS_FACTOR = 3;   // 升档阈值 = TIER_SIZE[t+1]²×3
