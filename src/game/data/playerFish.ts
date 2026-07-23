// =============================================================
// 大鱼吃小鱼 · 玩家初始鱼（6 条）
// 依据 plan.md §3 玩家鱼表实现。
// 契约约束：skill.id 依次为 dash / shock / lure / spikes / cloak / vortex。
// 数值说明：
//   - baseSize 统一 12（= TIER_SIZE[1]），开局同一起跑线，差异全靠技能与被动。
//   - baseSpeed 基准 138（= 150 - 1*12）。电光的被动「移速+8%」直接烘焙进
//     baseSpeed=149（138×1.08≈149.04），其余鱼的被动由玩法层按 id 实现。
// =============================================================
import type { PlayerFishSpec } from '../types';

export const playerFish: PlayerFishSpec[] = [
  {
    id: 'bubbles',
    name: '蓝宝',
    title: '蔚蓝新星',
    desc: '活力满格的小蓝鱼，摆尾一冲，谁也追不上。',
    unlockLevel: 1,
    sprite: '/assets/fish/bubbles.png',
    facing: 'left',
    baseSize: 12,
    baseSpeed: 138,
    skill: {
      id: 'dash',
      name: '猛冲',
      icon: '💨',
      desc: '0.7秒内移动速度×2.6',
      cooldown: 5,
      duration: 0.7,
    },
    // 无被动（表中为「—」）
  },
  {
    id: 'volt',
    name: '电光',
    title: '雷霆巡游者',
    desc: '体内流淌着电流，一记电弧让周围的猎物乖乖待命。',
    unlockLevel: 3,
    sprite: '/assets/fish/volt.png',
    facing: 'left',
    baseSize: 12,
    baseSpeed: 149, // 被动「移速+8%」已烘焙：138×1.08≈149
    skill: {
      id: 'shock',
      name: '电弧',
      icon: '⚡',
      desc: '麻痹周围220px内可吃的鱼2.5秒，原地任你吃',
      cooldown: 12,
      duration: 2.5,
    },
    passiveDesc: '被动：移动速度+8%',
  },
  {
    id: 'lumi',
    name: '灯笼',
    title: '深渊引路人',
    desc: '头顶一点暖光，在漆黑的深海里，猎物自己送上门。',
    unlockLevel: 6,
    sprite: '/assets/fish/lumi.png',
    facing: 'left',
    baseSize: 12,
    baseSpeed: 138,
    skill: {
      id: 'lure',
      name: '诱光',
      icon: '🏮',
      desc: '5秒内，320px内可吃的鱼被吸引游向你',
      cooldown: 15,
      duration: 5,
    },
    passiveDesc: '被动：镜头视野+12%',
  },
  {
    id: 'spike',
    name: '刺球',
    title: '不屈堡垒',
    desc: '圆滚滚的身躯藏满棘刺，膨胀起来连鲨鱼都要退避三舍。',
    unlockLevel: 10,
    sprite: '/assets/fish/spike.png',
    facing: 'left',
    baseSize: 12,
    baseSpeed: 138,
    skill: {
      id: 'spikes',
      name: '棘刺',
      icon: '🦔',
      desc: '膨胀3秒，碰到你的大鱼被弹开并逃跑2秒',
      cooldown: 18,
      duration: 3,
    },
    passiveDesc: '被动：被吃判定-12%（等效体型）',
  },
  {
    id: 'mira',
    name: '幻影',
    title: '幽影行者',
    desc: '来无影去无踪，大鱼的血盆大口只能咬到一串气泡。',
    unlockLevel: 15,
    sprite: '/assets/fish/mira.png',
    facing: 'left',
    baseSize: 12,
    baseSpeed: 138,
    skill: {
      id: 'cloak',
      name: '隐身',
      icon: '🫥',
      desc: '4秒内，大鱼完全丢失目标',
      cooldown: 20,
      duration: 4,
    },
    passiveDesc: '被动：金币+15%',
  },
  {
    id: 'draco',
    name: '龙皇',
    title: '深海霸主',
    desc: '传说中的深海之皇，张口一吸，整片海域皆为盘中餐。',
    unlockLevel: 21,
    sprite: '/assets/fish/draco.png',
    facing: 'left',
    baseSize: 12,
    baseSpeed: 138,
    skill: {
      id: 'vortex',
      name: '吞噬漩涡',
      icon: '🌀',
      desc: '将400px内可吃的鱼吸入并直接吃掉',
      cooldown: 25,
      duration: 1.5, // 漩涡视觉/吸入过程时长（契约外微调，供玩法层参考）
    },
    passiveDesc: '被动：成长速度+12%',
  },
];

/** 便捷索引（契约之外的增量导出）。 */
export const playerFishById: ReadonlyMap<string, PlayerFishSpec> = new Map(
  playerFish.map((p) => [p.id, p]),
);
