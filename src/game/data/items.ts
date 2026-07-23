// =============================================================
// 大鱼吃小鱼 · 局内道具 & 商店商品
// 依据 plan.md §4 / §5 逐行实现（商店数值逐行照抄）。
// =============================================================
import type { PickupDef, ShopItemDef } from '../types';

// -------------------------------------------------------------
// 局内道具（§4）：漂浮发光气泡包裹，碰到即得。
// duration 仅对持续型 buff 填写；即得型（炸弹/护盾）无 duration。
// -------------------------------------------------------------
export const pickups: PickupDef[] = [
  {
    id: 'bomb',
    name: '炸弹',
    icon: '💣',
    desc: '获得1枚炸弹（存在右下角小按钮）：引爆后380px内大鱼眩晕4秒并掉金币，小鱼直接被吃掉',
    weight: 3,
  },
  {
    id: 'magnet',
    name: '磁铁',
    icon: '🧲',
    desc: '8秒内：金币与1-2档小鱼被吸向你',
    weight: 4,
    duration: 8,
  },
  {
    id: 'shield',
    name: '护盾',
    icon: '🛡️',
    desc: '获得1层护盾：被大鱼咬中时抵消并震开对方',
    weight: 4,
  },
  {
    id: 'hourglass',
    name: '沙漏',
    icon: '⏳',
    desc: '6秒内：除你以外所有鱼速度-55%',
    weight: 3,
    duration: 6,
  },
  {
    id: 'goldrush',
    name: '金潮',
    icon: '💰',
    desc: '10秒内：金币与分数×2',
    weight: 3,
    duration: 10,
  },
];

// -------------------------------------------------------------
// 商店商品（§5）：price = basePrice × growth^已购级（economy.priceOf）。
// maxLv / base / growth 三列逐行照抄 §5 表格。
// -------------------------------------------------------------
export const shopItems: ShopItemDef[] = [
  {
    id: 'fry',
    name: '强健鱼苗',
    icon: '🐣',
    desc: '每级：开局体型+6%',
    maxLevel: 5,
    basePrice: 100,
    growth: 1.8,
  },
  {
    id: 'turbo',
    name: '涡轮增压',
    icon: '⚡',
    desc: '每级：技能冷却-6%',
    maxLevel: 5,
    basePrice: 120,
    growth: 1.8,
  },
  {
    id: 'mag',
    name: '吸金磁场',
    icon: '🧲',
    desc: '每级：金币+10%',
    maxLevel: 5,
    basePrice: 100,
    growth: 1.8,
  },
  {
    id: 'bait',
    name: '彩虹诱饵',
    icon: '🌈',
    desc: '每级：彩虹鱼出现权重+35%',
    maxLevel: 3,
    basePrice: 200,
    growth: 2.2,
  },
  {
    id: 'bubble',
    name: '护身气泡',
    icon: '🫧',
    desc: 'Lv1：开局1层护盾；Lv2：破盾后60秒重生；Lv3：缩短至30秒',
    maxLevel: 3,
    basePrice: 150,
    growth: 2.2,
  },
  {
    id: 'belt',
    name: '炸弹腰包',
    icon: '💣',
    desc: '每级：开局自带1/2枚炸弹',
    maxLevel: 2,
    basePrice: 180,
    growth: 2.5,
  },
  {
    id: 'brain',
    name: '智慧鱼脑',
    icon: '🧠',
    desc: '每级：经验+12%',
    maxLevel: 5,
    basePrice: 150,
    growth: 1.9,
  },
  {
    id: 'totem',
    name: '复活图腾',
    icon: '🗿',
    desc: '每级：每局可复活1/2次（复活后体型保留60%）',
    maxLevel: 2,
    basePrice: 300,
    growth: 2.5,
  },
  {
    id: 'fin',
    name: '轻捷鱼鳍',
    icon: '🌊',
    desc: '每级：移动速度+4%',
    maxLevel: 5,
    basePrice: 120,
    growth: 1.8,
  },
  {
    id: 'chain',
    name: '盛宴连锁',
    icon: '🔗',
    desc: '每级：连吃窗口+0.6秒',
    maxLevel: 3,
    basePrice: 130,
    growth: 2.0,
  },
];
