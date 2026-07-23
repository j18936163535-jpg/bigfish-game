// =============================================================
// GameScene.ts — 局内核心玩法（plan §2.1 GameScene 契约实现）
// 负责：无限世界与跟随相机 / 生成环刷怪与回收 / 行为 AI 调度 /
//       吞食与吸入动画 / 质量成长与升档 / 技能与道具 / 连吃 /
//       护盾-复活-真死死亡流程 / HUD 状态推送 / 全部场景渲染。
//
// 契约缺口的局部适配（详见阶段报告，均未改动他人文件）：
//  1) plan §2.1 未约定 engine/loop、engine/camera、engine/particles 的 API，
//     本文件内置 rAF 主循环 + 跟随相机，粒子用 scene/fx.ts 自给实现。
//  2) data 导出名已对齐内容代理实际实现：fish / pickups（契约未约定导出名）。
//  3) 桌面键盘移动用 engine/input.ts 的 bindKeyboard；空格技能 / B 炸弹
//     的按键分发在契约之外，于本类内部实现。
// =============================================================
import { Joystick, bindKeyboard } from '../engine/input';
import { FishRenderer } from '../render/fishRenderer';
import { audio } from '../audio';
import { fish } from '../data/fish';
import { pickups } from '../data/items';
import {
  TIER_SIZE, RAINBOW_DURATION, COMBO_WINDOW, EAT_RATIO, DANGER_RATIO,
  SPAWN_AHEAD, MAX_NPC, MASS_PER_SIZE_SQ, TIER_UP_MASS_FACTOR,
  GRACE_PERIOD, GRACE_RAMP,
} from '../config';
import type {
  HudState, PickupDef, PlayerFishSpec, RunModifiers, RunResult, Tier,
} from '../types';
import { FxPool, drawSeaBackground } from './fx';
import { countBig, makeNpc, pickSpec, type Npc } from './spawner';
import { updateNpc, type AiCtx } from './ai';

// -------------------------------------------------------------
// 局部数值微调（plan §6 允许玩法代理在框架内微调）
// -------------------------------------------------------------
/** 质量放大系数：保证 3-6 分钟一局可到 tier 4-5（QA 3→4→4.5：实测节奏校准） */
const GROWTH_BOOST = 4.5;
const EAT_ANIM = 0.25;        // 猎物吸入动画时长(s)
const CHASE_RANGE = 420;      // chase 感知圈(px)
const DESPAWN_R = SPAWN_AHEAD + 1000; // 离屏过远回收半径
const SHOCK_R = 220;          // 电弧半径
const SHOCK_STUN = 2.5;
const LURE_R = 320;
const LURE_T = 5;
const SPIKES_T = 3;
const CLOAK_T = 4;
const VORTEX_R = 400;
const VORTEX_T = 1.6;
const DASH_T = 0.7;
const DASH_MUL = 2.6;
const BOMB_R = 380;
const BOMB_STUN = 4;
const MAGNET_T = 8;
const MAGNET_R = 320;
const HOURGLASS_T = 6;
const GOLDRUSH_T = 10;
const PICKUP_MAX = 3;
const PICKUP_TTL = 30;
const RAINBOW_TRAIL = ['#e8845f', '#f2b25c', '#e8d35f', '#7fc98f', '#6fb7c9', '#c9a06f'];

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

const ALL_SPECS = fish;
const ALL_PICKUPS = pickups;

export interface GameSceneOpts {
  canvas: HTMLCanvasElement;
  player: PlayerFishSpec;
  mods: RunModifiers;
  joystickHost: HTMLElement;
  onHud: (h: HudState) => void;
  onEnd: (r: RunResult) => void;
  onDiscover: (fishId: string) => void;
}

interface PickupEnt {
  def: PickupDef;
  x: number; y: number;
  phase: number;
  ttl: number;
  taken: boolean;
}

interface CoinOrb {
  x: number; y: number;
  vx: number; vy: number;
  value: number;
  ttl: number;
}

interface Mote {
  x: number; y: number;
  r: number; s: number; p: number;
}

export class GameScene {
  private opts: GameSceneOpts;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private renderer = new FishRenderer();
  private joystick: Joystick | null = null;
  private fx = new FxPool();

  // 生命周期
  private raf = 0;
  private lastTs = 0;
  private running = false;
  private destroyed = false;
  private paused = false;
  private ended = false;

  // 画布
  private W = 1;
  private H = 1;
  private dpr = 1;

  // 玩家
  private px = 0; private py = 0;
  private pvx = 0; private pvy = 0;
  private ang = 0;
  private dirX = 1;
  private size = TIER_SIZE[1];
  private targetSize = TIER_SIZE[1];
  private tier: Tier = 1;
  private maxTier: Tier = 1;
  private mass = 0;

  // 局内资源
  private score = 0;
  private coins = 0;
  private kills = 0;
  private runTime = 0;
  private shield = 0;
  private shieldRegenT = 0;
  private bombs = 0;
  private revives = 0;

  // 状态计时
  private invulnT = 0;
  private dead = false;
  private deathT = 0;
  private chewT = 0;
  private skillCd = 0;
  private skillCdMax = 1;
  private dashT = 0;
  private lureT = 0;
  private spikesT = 0;
  private cloakT = 0;
  private vortexT = 0;
  private rainbowT = 0;
  private magnetT = 0;
  private hourglassT = 0;
  private goldrushT = 0;
  private comboN = 0;
  private comboT = 0;

  // 实体
  private npcs: Npc[] = [];
  private pickups: PickupEnt[] = [];
  private orbs: CoinOrb[] = [];
  private discovered = new Set<string>();

  // 生成计时
  private spawnT = 0;
  private pickupT = 6;

  // 相机与震屏
  private cam = { x: 0, y: 0, zoom: 1 };
  private shakeT = 0;
  private shakeDur = 1;
  private shakeMag = 0;

  // 环境粒子（浮游尘/环境气泡）
  private dust: Mote[] = [];
  private ambBubbles: Mote[] = [];
  private trailT = 0;
  private trailColorIdx = 0;

  private kb: { vx: () => number; vy: () => number; destroy: () => void } | null = null;

  constructor(opts: GameSceneOpts) {
    this.opts = opts;
    this.canvas = opts.canvas;
    this.ctx = this.canvas.getContext('2d');
  }

  // ===========================================================
  // 生命周期（幂等，可重复 start/destroy —— React StrictMode 安全）
  // ===========================================================
  start(): void {
    if (this.running) return;
    this.destroyed = false;

    // 重置全部局内状态
    this.px = 0; this.py = 0; this.pvx = 0; this.pvy = 0;
    this.ang = 0; this.dirX = 1;
    this.size = TIER_SIZE[1] * this.opts.mods.startSizeMul;
    this.targetSize = this.size;
    this.tier = 1; this.maxTier = 1;
    this.mass = this.size * this.size * TIER_UP_MASS_FACTOR;
    this.score = 0; this.coins = 0; this.kills = 0; this.runTime = 0;
    this.shield = this.opts.mods.startShield;
    this.shieldRegenT = 0;
    this.bombs = this.opts.mods.startBombs;
    this.revives = this.opts.mods.revives;
    this.invulnT = 0; this.dead = false; this.deathT = 0; this.chewT = 0;
    this.skillCd = 0; this.skillCdMax = Math.max(0.1, this.opts.player.skill.cooldown * this.opts.mods.cdMul);
    this.dashT = 0; this.lureT = 0; this.spikesT = 0; this.cloakT = 0; this.vortexT = 0;
    this.rainbowT = 0; this.magnetT = 0; this.hourglassT = 0; this.goldrushT = 0;
    this.comboN = 0; this.comboT = 0;
    this.npcs = []; this.pickups = []; this.orbs = [];
    this.discovered.clear();
    this.fx.clear();
    this.spawnT = 0; this.pickupT = 6;
    this.shakeT = 0; this.shakeMag = 0;
    this.paused = false; this.ended = false;

    this.resize();
    this.cam.x = this.px; this.cam.y = this.py;
    this.cam.zoom = this.computeZoom();
    this.initAmbient();
    this.initialSpawn();

    if (this.opts.joystickHost) this.joystick = new Joystick(this.opts.joystickHost);
    this.kb = bindKeyboard(); // 桌面端 WASD / 方向键（engine 契约外补充 API）
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('resize', this.onResize);

    void this.renderer.preload([this.opts.player, ...ALL_SPECS]).catch(() => undefined);

    audio.unlock();
    audio.startBgm();

    // QA 实测钩子（仅 URL 带 ?qa=1 时启用）：只读快照，供无头测试脚本
    // 采样玩家/NPC 位置以模拟"会追小鱼、会躲大鱼"的中等水平操作。
    if (typeof window !== 'undefined' && /[?&]qa=1\b/.test(window.location.search)) {
      (window as unknown as { __qa?: { snap(): unknown } }).__qa = {
        snap: () => ({
          px: this.px, py: this.py, size: this.size, tier: this.tier,
          runTime: Math.round(this.runTime * 10) / 10,
          dead: this.dead, kills: this.kills, score: this.score,
          npcs: this.npcs
            .filter((n) => !n.dead && n.eaten < 0)
            .map((n) => ({ x: Math.round(n.x), y: Math.round(n.y), size: Math.round(n.size * 10) / 10 })),
        }),
      };
    }

    this.running = true;
    this.lastTs = 0;
    this.raf = requestAnimationFrame(this.frame);
    this.emitHud();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('resize', this.onResize);
    this.joystick?.destroy();
    this.joystick = null;
    this.kb?.destroy();
    this.kb = null;
    audio.stopBgm();
    this.npcs = [];
    this.pickups = [];
    this.orbs = [];
    this.fx.clear();
  }

  setPaused(p: boolean): void {
    this.paused = p;
    if (!p) this.lastTs = 0; // 恢复时避免 dt 跳变
  }

  /** 契约外补充：供暂停菜单"退出本局"使用，onEnd 仍只触发一次 */
  quit(): void {
    this.finish('quit');
  }

  // ===========================================================
  // 主循环
  // ===========================================================
  private frame = (ts: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = this.lastTs ? Math.min(0.05, (ts - this.lastTs) / 1000) : 0.016;
    this.lastTs = ts;
    if (!this.paused) this.update(dt);
    this.render(ts / 1000);
    this.emitHud();
  };

  private update(dt: number): void {
    // 通用计时器
    this.invulnT = Math.max(0, this.invulnT - dt);
    this.chewT = Math.max(0, this.chewT - dt);
    this.skillCd = Math.max(0, this.skillCd - dt);
    this.dashT = Math.max(0, this.dashT - dt);
    this.lureT = Math.max(0, this.lureT - dt);
    this.spikesT = Math.max(0, this.spikesT - dt);
    this.cloakT = Math.max(0, this.cloakT - dt);
    this.vortexT = Math.max(0, this.vortexT - dt);
    this.rainbowT = Math.max(0, this.rainbowT - dt);
    this.magnetT = Math.max(0, this.magnetT - dt);
    this.hourglassT = Math.max(0, this.hourglassT - dt);
    this.goldrushT = Math.max(0, this.goldrushT - dt);
    if (this.shieldRegenT > 0) {
      this.shieldRegenT -= dt;
      if (this.shieldRegenT <= 0 && this.shield === 0) this.shield = 1;
    }
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.comboN = 0;
    }

    if (this.dead) {
      // 死亡演出：躯体下沉，世界继续运转，计时结束后结算（仅一次）
      this.deathT -= dt;
      this.py += 26 * dt;
      this.updateNpcs(dt);
      this.fx.update(dt);
      this.updateAmbient(dt);
      this.updateCamera(dt);
      if (this.deathT <= 0) this.finish('eaten');
      return;
    }

    this.runTime += dt;
    this.updatePlayer(dt);
    this.spawnTick(dt);
    this.pickupTick(dt);
    this.updateNpcs(dt);
    this.updateOrbs(dt);
    this.contacts();
    this.fx.update(dt);
    this.updateAmbient(dt);
    this.updateCamera(dt);

    // 离屏过远回收 + 移除死体
    const d2r = DESPAWN_R * DESPAWN_R;
    this.npcs = this.npcs.filter((n) => {
      if (n.dead) return false;
      const dx = n.x - this.px;
      const dy = n.y - this.py;
      return dx * dx + dy * dy < d2r;
    });
    this.pickups = this.pickups.filter((p) => {
      if (p.taken || p.ttl <= 0) return false;
      const dx = p.x - this.px;
      const dy = p.y - this.py;
      return dx * dx + dy * dy < d2r;
    });
  }

  // ===========================================================
  // 输入（Joystick 契约 + bindKeyboard 桌面移动；
  //       空格技能 / B 炸弹的按键分发为契约外局部补充）
  // ===========================================================
  private onKeyDown = (e: KeyboardEvent): void => {
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); this.useSkill(); }
    else if (k === 'b') { this.useBomb(); }
  };

  private onResize = (): void => this.resize();

  private resize(): void {
    const parent = this.canvas.parentElement;
    const w = parent ? parent.clientWidth : window.innerWidth;
    const h = parent ? parent.clientHeight : window.innerHeight;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = Math.max(1, w);
    this.H = Math.max(1, h);
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    this.canvas.style.width = `${this.W}px`;
    this.canvas.style.height = `${this.H}px`;
  }

  private inputVector(): { x: number; y: number } {
    if (this.joystick && this.joystick.active) {
      return { x: this.joystick.dx, y: this.joystick.dy };
    }
    if (this.kb) {
      const x = this.kb.vx();
      const y = this.kb.vy();
      if (x !== 0 || y !== 0) return { x, y };
    }
    return { x: 0, y: 0 };
  }

  // ===========================================================
  // 玩家
  // ===========================================================
  private updatePlayer(dt: number): void {
    const iv = this.inputVector();
    // 体型系数：越大越略慢
    const sizeFactor = Math.pow(TIER_SIZE[1] / Math.max(8, this.size), 0.18);
    let sp = this.opts.player.baseSpeed * this.opts.mods.speedMul * sizeFactor;
    if (this.opts.player.id === 'volt') sp *= 1.08;      // 电光被动：移速+8%
    if (this.dashT > 0) sp *= DASH_MUL;                  // 猛冲 2.6×
    if (this.rainbowT > 0) sp *= 1.15;

    const k = 1 - Math.exp(-8 * dt);
    this.pvx += (iv.x * sp - this.pvx) * k;
    this.pvy += (iv.y * sp - this.pvy) * k;
    this.px += this.pvx * dt;
    this.py += this.pvy * dt;

    if (Math.hypot(this.pvx, this.pvy) > 12) {
      this.ang = Math.atan2(this.pvy, this.pvx); // 朝向跟随移动方向
      this.dirX = Math.cos(this.ang) >= 0 ? 1 : -1;
    }

    // 升档体型平滑插值
    this.size += (this.targetSize - this.size) * Math.min(1, 2.2 * dt);

    // 彩虹狂暴拖尾
    if (this.rainbowT > 0) {
      this.trailT -= dt;
      if (this.trailT <= 0) {
        this.trailT = 0.03;
        this.trailColorIdx = (this.trailColorIdx + 1) % RAINBOW_TRAIL.length;
        this.fx.spark(
          this.px - Math.cos(this.ang) * this.size,
          this.py - Math.sin(this.ang) * this.size,
          RAINBOW_TRAIL[this.trailColorIdx], 2, 40, 0.55, 4,
        );
      }
    }
  }

  /** 玩家有效体型（刺球被动：被吃判定 -12% ⇔ 等效体型 +12%） */
  private effSize(): number {
    return this.size * (this.opts.player.id === 'spike' ? 1.12 : 1);
  }

  private canEat(n: Npc): boolean {
    if (this.rainbowT > 0) return true;              // 狂暴：可吃任何鱼
    if (n.spec.special === 'rainbow') return true;   // 彩虹鱼永远可吃且无害
    return n.size < this.size * EAT_RATIO;
  }

  private threatens(n: Npc): boolean {
    if (this.rainbowT > 0) return false;
    if (n.spec.special === 'rainbow') return false;
    return n.size > this.effSize() * DANGER_RATIO;
  }

  private coinMulTotal(): number {
    return this.opts.mods.coinMul * (this.opts.player.id === 'mira' ? 1.15 : 1); // 幻影被动：金币+15%
  }

  private goldMul(): number {
    return this.goldrushT > 0 ? 2 : 1; // 金潮：金币与分数 ×2
  }

  // ===========================================================
  // 吞食与成长
  // ===========================================================
  private eat(n: Npc): void {
    if (n.dead || n.eaten >= 0) return;
    n.eaten = 0;
    n.fromX = n.x;
    n.fromY = n.y;
    this.kills++;

    // 连吃（COMBO_WINDOW + 商店 chain 延长窗口）
    const window_ = COMBO_WINDOW + this.opts.mods.comboWindowBonus;
    this.comboN = this.comboT > 0 ? this.comboN + 1 : 1;
    this.comboT = window_;
    if (this.comboN >= 3) audio.play('combo');

    // 金币与分数（mods.coinMul × 金潮 ×2 + 连吃 +n / +n×2）
    this.coins += Math.round(n.spec.coins * this.coinMulTotal() * this.goldMul()) + this.comboN;
    this.score += Math.round(n.spec.score * this.goldMul()) + this.comboN * 2;

    // 质量与升档（plan §6：m = size²×0.12，阈值 TIER_SIZE[t+1]²×3）
    const growMul = GROWTH_BOOST * (this.opts.player.id === 'draco' ? 1.12 : 1); // 龙皇被动：成长+12%
    this.addMass(n.size * n.size * MASS_PER_SIZE_SQ * growMul);

    // 图鉴发现回调（每条鱼种每局首次）
    if (!this.discovered.has(n.spec.id)) {
      this.discovered.add(n.spec.id);
      this.opts.onDiscover(n.spec.id);
    }

    // 反馈三件套：吸入动画(上方) + 气泡 burst + 音效（大型猎物低音）
    const mx = this.px + Math.cos(this.ang) * this.size;
    const my = this.py + Math.sin(this.ang) * this.size;
    this.fx.burst(mx, my, '#cfeef2', 6 + n.spec.tier * 2, 120 + n.spec.tier * 25, 0.55, 2.5);
    this.chewT = 0.18;
    audio.play(n.spec.tier >= this.tier ? 'eatBig' : 'eat');

    if (n.spec.special === 'rainbow') this.startFrenzy();
  }

  private addMass(m: number): void {
    this.mass += m;
    while (this.tier < 8) {
      const next = (this.tier + 1) as Tier;
      if (this.mass < TIER_SIZE[next] * TIER_SIZE[next] * TIER_UP_MASS_FACTOR) break;
      this.tier = next;
      if (this.tier > this.maxTier) this.maxTier = this.tier;
      this.targetSize = TIER_SIZE[this.tier];
      audio.play('levelup');
      this.fx.ring(this.px, this.py, '#f2b25c', this.targetSize * 4.5, 0.8);
      this.fx.spark(this.px, this.py, '#f2d8a8', 16, 220, 0.8, 3.5);
      this.shake(0.22, 5);
    }
  }

  /** 复活/质量回退后按质量重算 tier（maxTier 不回退） */
  private retier(): void {
    let nt: Tier = 1;
    for (let t = 8; t >= 1; t--) {
      if (this.mass >= TIER_SIZE[t as Tier] * TIER_SIZE[t as Tier] * TIER_UP_MASS_FACTOR) {
        nt = t as Tier;
        break;
      }
    }
    this.tier = nt;
  }

  private startFrenzy(): void {
    this.rainbowT = RAINBOW_DURATION;
    audio.play('rainbow');
    this.fx.ring(this.px, this.py, '#f2b25c', this.size * 6, 0.9);
    this.fx.spark(this.px, this.py, '#e8d35f', 22, 260, 1, 4);
  }

  // ===========================================================
  // 碰撞：吃鱼 / 被咬（死亡流程）
  // ===========================================================
  private contacts(): void {
    if (this.dead || this.invulnT > 0) return;
    // 漂浮道具：碰到即得
    for (const p of this.pickups) {
      if (p.taken) continue;
      const rr = this.size + 26;
      const dx = p.x - this.px;
      const dy = p.y - this.py;
      if (dx * dx + dy * dy <= rr * rr) {
        p.taken = true;
        this.applyPickup(p.def);
      }
    }
    // 鱼：吃或被咬
    for (const n of this.npcs) {
      if (n.dead || n.eaten >= 0) continue;
      const rr = this.size * 0.9 + n.size * 0.7;
      const dx = n.x - this.px;
      const dy = n.y - this.py;
      if (dx * dx + dy * dy > rr * rr) continue;
      if (this.canEat(n)) {
        this.eat(n);
      } else if (this.threatens(n)) {
        this.onBitten(n);
        if (this.dead || this.invulnT > 0) return;
      }
    }
  }

  /** 大鱼接触玩家 → 棘刺弹开 → 护盾抵消并震开 → 复活 → 真死 */
  private onBitten(n: Npc): void {
    if (this.spikesT > 0) {
      // 棘刺：大鱼被弹开并逃跑 2s
      this.knock(n, 760);
      n.scared = 2;
      this.shake(0.25, 8);
      this.fx.burst(this.px, this.py, '#e8845f', 12, 200, 0.5, 3);
      audio.play('skill');
      return;
    }
    if (this.shield > 0) {
      // 护盾抵消并震开对方
      this.shield--;
      if (this.opts.mods.shieldRespawn > 0) this.shieldRegenT = this.opts.mods.shieldRespawn;
      this.knock(n, 900);
      n.scared = 1.5;
      this.invulnT = 1.5;
      this.shake(0.35, 12);
      this.fx.ring(this.px, this.py, '#9fd8e8', this.size * 3.5, 0.5);
      audio.play('shieldBreak');
      return;
    }
    if (this.revives > 0) {
      // 复活：体型保留 60%（质量同步回退，tier 重算）
      this.revives--;
      this.invulnT = 2.5;
      const ns = this.size * 0.6;
      this.mass = ns * ns * TIER_UP_MASS_FACTOR;
      this.retier();
      this.targetSize = ns;
      for (const m of this.npcs) {
        if (m.dead || m.eaten >= 0) continue;
        const dx = m.x - this.px;
        const dy = m.y - this.py;
        if (dx * dx + dy * dy < 460 * 460) { this.knock(m, 700); m.scared = Math.max(m.scared, 1.2); }
      }
      this.shake(0.4, 12);
      this.fx.ring(this.px, this.py, '#7fc98f', this.size * 5, 0.8);
      audio.play('revive');
      return;
    }
    this.die();
  }

  private die(): void {
    if (this.dead) return;
    this.dead = true;
    this.deathT = 1.4;
    this.comboN = 0;
    this.comboT = 0;
    this.fx.burst(this.px, this.py, '#cfeef2', 26, 240, 1.1, 4);
    this.shake(0.5, 14);
    audio.play('death');
  }

  private knock(n: Npc, power: number): void {
    const dx = n.x - this.px;
    const dy = n.y - this.py;
    const d = Math.hypot(dx, dy) || 1;
    n.vx += (dx / d) * power;
    n.vy += (dy / d) * power;
  }

  private finish(cause: 'eaten' | 'quit'): void {
    if (this.ended) return; // onEnd 一次且仅一次
    this.ended = true;
    this.opts.onEnd({
      score: this.score,
      coins: this.coins,
      maxTier: this.maxTier,
      kills: this.kills,
      duration: Math.round(this.runTime),
      cause,
    });
  }

  // ===========================================================
  // 技能与道具
  // ===========================================================
  useSkill(): void {
    if (!this.running || this.paused || this.dead || this.ended) return;
    if (this.skillCd > 0) return;
    const sk = this.opts.player.skill;
    switch (sk.id) {
      case 'dash': // 猛冲：0.7s 内 2.6× 移速
        this.dashT = sk.duration ?? DASH_T;
        audio.play('dash');
        break;
      case 'shock': { // 电弧：220px 内可吃鱼麻痹 2.5s
        let hit = false;
        for (const n of this.npcs) {
          if (n.dead || n.eaten >= 0 || !this.canEat(n)) continue;
          const dx = n.x - this.px;
          const dy = n.y - this.py;
          if (dx * dx + dy * dy < SHOCK_R * SHOCK_R) { n.stun = SHOCK_STUN; hit = true; }
        }
        this.fx.ring(this.px, this.py, '#9fd8e8', SHOCK_R, 0.5);
        audio.play('skill');
        if (hit) audio.play('stun');
        break;
      }
      case 'lure': // 诱光：5s 内 320px 内可吃鱼被吸引
        this.lureT = sk.duration ?? LURE_T;
        audio.play('skill');
        break;
      case 'spikes': // 棘刺：3s 膨胀，大鱼碰你被弹开逃跑
        this.spikesT = sk.duration ?? SPIKES_T;
        audio.play('skill');
        break;
      case 'cloak': // 隐身：4s 大鱼完全丢失目标
        this.cloakT = sk.duration ?? CLOAK_T;
        audio.play('skill');
        break;
      case 'vortex': // 吞噬漩涡：400px 内可吃鱼被吸入直接吃掉
        this.vortexT = VORTEX_T;
        this.fx.ring(this.px, this.py, '#8fd0c9', VORTEX_R, 0.7);
        audio.play('skill');
        break;
      default:
        return; // 未知技能 id：不进入冷却
    }
    const cdMax = Math.max(0.1, sk.cooldown * this.opts.mods.cdMul);
    this.skillCdMax = cdMax;
    this.skillCd = cdMax;
  }

  useBomb(): void {
    if (!this.running || this.paused || this.dead || this.ended) return;
    if (this.bombs <= 0) return;
    this.bombs--;
    audio.play('bomb');
    this.shake(0.5, 14);
    this.fx.ring(this.px, this.py, '#f2b25c', BOMB_R, 0.6);
    this.fx.burst(this.px, this.py, '#f2d8a8', 24, 320, 0.8, 4);
    let stunned = false;
    for (const n of this.npcs) {
      if (n.dead || n.eaten >= 0) continue;
      const dx = n.x - this.px;
      const dy = n.y - this.py;
      if (dx * dx + dy * dy > BOMB_R * BOMB_R) continue;
      if (this.canEat(n)) {
        this.eat(n); // 小鱼直接吃掉
      } else {
        n.stun = BOMB_STUN; // 大鱼眩晕 4s + 掉金币
        stunned = true;
        this.dropOrbs(n.x, n.y, 2, 3 + n.spec.tier * 2);
      }
    }
    if (stunned) audio.play('stun');
  }

  private applyPickup(def: PickupDef): void {
    audio.play('pickup');
    this.fx.burst(this.px, this.py, '#ffe9b0', 14, 170, 0.6, 3);
    switch (def.id) {
      case 'bomb':
        this.bombs += 1;
        break;
      case 'magnet':
        this.magnetT = def.duration ?? MAGNET_T;
        break;
      case 'shield':
        this.shield = Math.min(2, this.shield + 1);
        break;
      case 'hourglass':
        this.hourglassT = def.duration ?? HOURGLASS_T;
        break;
      case 'goldrush':
        this.goldrushT = def.duration ?? GOLDRUSH_T;
        break;
      default:
        break;
    }
  }

  private dropOrbs(x: number, y: number, n: number, value: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 90 + Math.random() * 80;
      this.orbs.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        value, ttl: 12,
      });
    }
  }

  private updateOrbs(dt: number): void {
    for (const o of this.orbs) {
      o.ttl -= dt;
      o.vx *= Math.max(0, 1 - 2.5 * dt);
      o.vy *= Math.max(0, 1 - 2.5 * dt);
      const dx = this.px - o.x;
      const dy = this.py - o.y;
      const d = Math.hypot(dx, dy) || 1;
      if (!this.dead && this.magnetT > 0 && d < MAGNET_R) {
        o.vx += (dx / d) * 1500 * dt;
        o.vy += (dy / d) * 1500 * dt;
        const sp = Math.hypot(o.vx, o.vy);
        if (sp > 620) { o.vx = (o.vx / sp) * 620; o.vy = (o.vy / sp) * 620; }
      }
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      if (!this.dead && d < this.size + 16) {
        this.coins += Math.max(1, Math.round(o.value * this.coinMulTotal() * this.goldMul()));
        audio.play('coin');
        this.fx.spark(o.x, o.y, '#f2b25c', 5, 90, 0.4, 2.5);
        o.ttl = 0;
      }
    }
    this.orbs = this.orbs.filter((o) => o.ttl > 0);
  }

  // ===========================================================
  // 生成：NPC 生成环 + 道具漂浮
  // ===========================================================
  private initialSpawn(): void {
    let guard = 0;
    while (this.npcs.length < 24 && guard++ < 300) {
      const spec = pickSpec(this.tier, 0, this.opts.mods.rainbowMul);
      if (!spec) break;
      const a = Math.random() * Math.PI * 2;
      if (spec.tier > this.tier && spec.special !== 'rainbow') {
        // 大鱼不贴在出生点刷
        const r = 700 + Math.random() * 500;
        this.npcs.push(makeNpc(spec, this.px + Math.cos(a) * r, this.py + Math.sin(a) * r));
      } else {
        const r = 260 + Math.random() * 900;
        // 近处鱼体型偏小：保证开局必有可吃的鱼
        const near = r < 560;
        this.npcs.push(makeNpc(
          spec, this.px + Math.cos(a) * r, this.py + Math.sin(a) * r,
          near ? { minMul: 0.7, maxMul: 0.85 } : undefined,
        ));
      }
    }
  }

  private spawnTick(dt: number): void {
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    this.spawnT = 0.4;
    let alive = 0;
    for (const n of this.npcs) if (!n.dead && n.eaten < 0) alive++;
    if (alive >= MAX_NPC) return;
    const spec = pickSpec(this.tier, countBig(this.npcs, this.tier), this.opts.mods.rainbowMul);
    if (!spec) return;
    // 生成环：SPAWN_AHEAD 之外
    const a = Math.random() * Math.PI * 2;
    const r = SPAWN_AHEAD + Math.random() * 350;
    this.npcs.push(makeNpc(spec, this.px + Math.cos(a) * r, this.py + Math.sin(a) * r));
  }

  private pickupTick(dt: number): void {
    this.pickupT -= dt;
    for (const p of this.pickups) p.ttl -= dt;
    if (this.pickupT > 0) return;
    this.pickupT = 8 + Math.random() * 6;
    if (this.pickups.length >= PICKUP_MAX || ALL_PICKUPS.length === 0) return;
    let total = 0;
    for (const d of ALL_PICKUPS) total += Math.max(0, d.weight);
    if (total <= 0) return;
    let r = Math.random() * total;
    let def = ALL_PICKUPS[0];
    for (const d of ALL_PICKUPS) {
      r -= Math.max(0, d.weight);
      if (r <= 0) { def = d; break; }
    }
    const a = Math.random() * Math.PI * 2;
    const rr = 420 + Math.random() * 420;
    this.pickups.push({
      def,
      x: this.px + Math.cos(a) * rr,
      y: this.py + Math.sin(a) * rr,
      phase: Math.random() * Math.PI * 2,
      ttl: PICKUP_TTL,
      taken: false,
    });
  }

  // ===========================================================
  // NPC 更新（行为 AI + 吸入动画）
  // ===========================================================
  private updateNpcs(dt: number): void {
    const alive = !this.dead;
    // 起步宽限与压迫感爬坡（QA 平衡，config.GRACE_PERIOD/GRACE_RAMP）：
    //  - 宽限期内 chase 完全不追、危险 dart 不瞄准；
    //  - 宽限后 chaseRange 从 55% 爬坡到满值、predAim 从 0.12 爬坡到 0.34；
    //  - 满值后再乘 tier 系数（0.85 + 0.03/档）：玩家越大，压迫越强。
    const grace = this.runTime < GRACE_PERIOD;
    const press = clamp((this.runTime - GRACE_PERIOD) / GRACE_RAMP, 0, 1);
    const tierPress = 0.85 + (this.tier - 1) * 0.03;
    const ctx: AiCtx = {
      px: this.px, py: this.py,
      playerSize: this.effSize(),
      playerVisible: this.cloakT <= 0 && alive,
      canPlayerEat: (n) => this.canEat(n),
      lure: this.lureT > 0 && alive ? LURE_R : 0,
      magnet: this.magnetT > 0 && alive ? MAGNET_R : 0,
      vortex: this.vortexT > 0 && alive ? VORTEX_R : 0,
      hourglass: this.hourglassT > 0,
      chaseRange: CHASE_RANGE * (0.55 + 0.45 * press) * tierPress,
      grace,
      predAim: grace ? 0 : 0.12 + 0.22 * press,
    };
    const mx = this.px + Math.cos(this.ang) * this.size;
    const my = this.py + Math.sin(this.ang) * this.size;
    for (const n of this.npcs) {
      if (n.dead) continue;
      if (n.eaten >= 0) {
        // 猎物缩放吸入玩家口中（约 0.25s，smoothstep 缓动）
        n.eaten = Math.min(1, n.eaten + dt / EAT_ANIM);
        const e = n.eaten * n.eaten * (3 - 2 * n.eaten);
        n.x = n.fromX + (mx - n.fromX) * e;
        n.y = n.fromY + (my - n.fromY) * e;
        if (n.eaten >= 1) n.dead = true;
        continue;
      }
      updateNpc(n, dt, ctx, Math.random);
    }
  }

  // ===========================================================
  // 相机 / 环境粒子 / 震屏
  // ===========================================================
  private computeZoom(): number {
    const base = Math.min(this.W, this.H) / 600; // tier1 时短边约见 600 世界像素
    const tierF = 1 / (1 + (this.tier - 1) * 0.13); // 升档镜头微微拉远
    const lumi = this.opts.player.id === 'lumi' ? 1 / 1.12 : 1; // 灯笼被动：视野+12%
    return clamp(base * tierF * lumi, 0.22, 2.2);
  }

  private updateCamera(dt: number): void {
    const k = 1 - Math.exp(-4.5 * dt);
    this.cam.x += (this.px - this.cam.x) * k;
    this.cam.y += (this.py - this.cam.y) * k;
    const tz = this.computeZoom();
    this.cam.zoom += (tz - this.cam.zoom) * Math.min(1, 1.6 * dt);
    if (this.shakeT > 0) this.shakeT -= dt;
  }

  private shake(dur: number, mag: number): void {
    this.shakeT = dur;
    this.shakeDur = dur;
    this.shakeMag = mag;
  }

  private initAmbient(): void {
    this.dust = [];
    this.ambBubbles = [];
    for (let i = 0; i < 44; i++) {
      this.dust.push({
        x: this.px + (Math.random() - 0.5) * 1800,
        y: this.py + (Math.random() - 0.5) * 1800,
        r: 0.8 + Math.random() * 1.8,
        s: 4 + Math.random() * 8,
        p: Math.random() * Math.PI * 2,
      });
    }
    for (let i = 0; i < 14; i++) {
      this.ambBubbles.push({
        x: this.px + (Math.random() - 0.5) * 1800,
        y: this.py + (Math.random() - 0.5) * 1800,
        r: 1.6 + Math.random() * 3.2,
        s: 26 + Math.random() * 34,
        p: Math.random() * Math.PI * 2,
      });
    }
  }

  private updateAmbient(dt: number): void {
    const hw = this.W / (2 * this.cam.zoom) + 90;
    const hh = this.H / (2 * this.cam.zoom) + 90;
    for (const b of this.ambBubbles) {
      b.y -= b.s * dt;
      b.x += Math.sin(b.y * 0.02 + b.p) * 10 * dt;
      if (b.y < this.cam.y - hh) {
        b.y = this.cam.y + hh;
        b.x = this.cam.x + (Math.random() - 0.5) * 2 * hw;
      }
    }
    for (const d of this.dust) {
      d.x -= d.s * dt;
      d.y += Math.sin(d.x * 0.01 + d.p) * 3 * dt;
      if (d.x < this.cam.x - hw) {
        d.x = this.cam.x + hw;
        d.y = this.cam.y + (Math.random() - 0.5) * 2 * hh;
      }
    }
  }

  // ===========================================================
  // HUD 推送（每帧调用，契约允许）
  // ===========================================================
  private pickupIcon(id: string): string {
    for (const d of ALL_PICKUPS) if (d.id === id) return d.icon;
    const fallback: Record<string, string> = {
      bomb: '💣', magnet: '🧲', shield: '🛡️', hourglass: '⏳', goldrush: '💰',
    };
    return fallback[id] ?? '✨';
  }

  private emitHud(): void {
    const sk = this.opts.player.skill;
    let progress = 1;
    if (this.tier < 8) {
      const lo = TIER_SIZE[this.tier] * TIER_SIZE[this.tier] * TIER_UP_MASS_FACTOR;
      const hi = TIER_SIZE[(this.tier + 1) as Tier] * TIER_SIZE[(this.tier + 1) as Tier] * TIER_UP_MASS_FACTOR;
      progress = clamp((this.mass - lo) / (hi - lo), 0, 1);
    }
    const buffs: HudState['buffs'] = [];
    if (this.rainbowT > 0) buffs.push({ id: 'rainbow', icon: '🌈', remain: this.rainbowT });
    if (this.magnetT > 0) buffs.push({ id: 'magnet', icon: this.pickupIcon('magnet'), remain: this.magnetT });
    if (this.hourglassT > 0) buffs.push({ id: 'hourglass', icon: this.pickupIcon('hourglass'), remain: this.hourglassT });
    if (this.goldrushT > 0) buffs.push({ id: 'goldrush', icon: this.pickupIcon('goldrush'), remain: this.goldrushT });
    if (this.lureT > 0) buffs.push({ id: 'lure', icon: sk.icon, remain: this.lureT });
    if (this.spikesT > 0) buffs.push({ id: 'spikes', icon: sk.icon, remain: this.spikesT });
    if (this.cloakT > 0) buffs.push({ id: 'cloak', icon: sk.icon, remain: this.cloakT });
    if (this.dashT > 0) buffs.push({ id: 'dash', icon: sk.icon, remain: this.dashT });
    if (this.vortexT > 0) buffs.push({ id: 'vortex', icon: sk.icon, remain: this.vortexT });

    const active = this.dashT > 0 || this.lureT > 0 || this.spikesT > 0
      || this.cloakT > 0 || this.vortexT > 0;

    this.opts.onHud({
      score: this.score,
      coins: this.coins,
      tier: this.tier,
      progress,
      skill: { id: sk.id, icon: sk.icon, cd: this.skillCd, cdMax: this.skillCdMax, active },
      buffs,
      combo: this.comboT > 0 && this.comboN >= 2
        ? { count: this.comboN, remain: this.comboT }
        : null,
      shield: this.shield,
      bombs: this.bombs,
      revives: this.revives,
      dead: this.dead,
    });
  }

  // ===========================================================
  // 渲染（FishRenderer 画所有鱼；背景/气泡/道具纯代码绘制）
  // ===========================================================
  private render(t: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const { W, H, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 深海背景（随 tier 加深）
    drawSeaBackground(ctx, W, H, this.tier, t);

    // 震屏偏移
    let sx = 0;
    let sy = 0;
    if (this.shakeT > 0) {
      const m = this.shakeMag * (this.shakeT / this.shakeDur);
      sx = (Math.random() * 2 - 1) * m;
      sy = (Math.random() * 2 - 1) * m;
    }

    ctx.save();
    ctx.translate(W / 2 + sx, H / 2 + sy);
    ctx.scale(this.cam.zoom, this.cam.zoom);
    ctx.translate(-this.cam.x, -this.cam.y);

    this.drawAmbient(ctx);

    // 漂浮道具（发光气泡包裹，碰到即得）
    for (const p of this.pickups) this.drawPickup(ctx, p, t);

    // 金币
    for (const o of this.orbs) {
      const blink = o.ttl < 3 ? 0.5 + 0.5 * Math.sin(t * 12) : 1;
      ctx.globalAlpha = blink;
      ctx.fillStyle = '#f2b25c';
      ctx.beginPath();
      ctx.arc(o.x, o.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#b97f35';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // NPC 鱼（危险鱼加淡红轮廓；可吃鱼不加）
    for (const n of this.npcs) {
      if (n.dead) continue;
      const dirX = Math.cos(n.dir) >= 0 ? 1 : -1;
      if (n.eaten >= 0) {
        const p = Math.min(1, n.eaten);
        this.renderer.draw(ctx, n.spec, n.x, n.y, n.size * (1 - p), dirX, t + n.phase, { alpha: 1 - 0.4 * p });
        continue;
      }
      if (this.threatens(n)) this.drawDangerRing(ctx, n, t);
      const alpha = n.stun > 0 ? 0.7 + 0.2 * Math.sin(t * 10) : 1;
      this.renderer.draw(ctx, n.spec, n.x, n.y, n.size, dirX, t + n.phase, { alpha });
      if (n.stun > 0) this.drawStunMarks(ctx, n, t);
    }

    this.drawPlayer(ctx, t);

    // 粒子最上层
    this.fx.draw(ctx);

    ctx.restore();
  }

  private drawAmbient(ctx: CanvasRenderingContext2D): void {
    // 浮游尘
    ctx.fillStyle = 'rgba(200,225,230,0.10)';
    for (const d of this.dust) {
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    // 环境气泡
    ctx.strokeStyle = 'rgba(190,225,235,0.22)';
    ctx.lineWidth = 1.2;
    for (const b of this.ambBubbles) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawPickup(ctx: CanvasRenderingContext2D, p: PickupEnt, t: number): void {
    const bobY = p.y + Math.sin(t * 2 + p.phase) * 5;
    const blink = p.ttl < 5 ? 0.45 + 0.55 * (Math.sin(t * 10) * 0.5 + 0.5) : 1;
    ctx.save();
    ctx.globalAlpha = blink;
    ctx.shadowColor = '#f2b25c';
    ctx.shadowBlur = 14 + 6 * Math.sin(t * 3 + p.phase);
    ctx.fillStyle = 'rgba(220,240,245,0.12)';
    ctx.beginPath();
    ctx.arc(p.x, bobY, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(235,245,250,0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.shadowBlur = 0;
    // 高光
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(p.x, bobY, 17, Math.PI * 1.15, Math.PI * 1.5);
    ctx.stroke();
    // 图标（emoji，plan §0 允许 UI 图标用 emoji）
    ctx.font = '20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.def.icon, p.x, bobY + 1);
    ctx.restore();
  }

  /** 危险鱼（能吃你的）淡红轮廓提示；可吃鱼不画 */
  private drawDangerRing(ctx: CanvasRenderingContext2D, n: Npc, t: number): void {
    ctx.save();
    ctx.globalAlpha = 0.24 + 0.1 * Math.sin(t * 4 + n.phase);
    ctx.strokeStyle = '#e8604c';
    ctx.lineWidth = 3;
    ctx.shadowColor = 'rgba(232,96,76,0.8)';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.size * 1.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawStunMarks(ctx: CanvasRenderingContext2D, n: Npc, t: number): void {
    ctx.save();
    ctx.fillStyle = '#f2d8a8';
    for (let i = 0; i < 3; i++) {
      const a = t * 4 + (i * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.arc(n.x + Math.cos(a) * n.size * 1.1, n.y - n.size * 1.2 + Math.sin(a) * 4, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, t: number): void {
    const frenzy = this.rainbowT > 0;

    // 诱光范围提示
    if (this.lureT > 0) {
      ctx.save();
      ctx.globalAlpha = 0.08 + 0.04 * Math.sin(t * 5);
      ctx.fillStyle = '#f2d8a8';
      ctx.beginPath();
      ctx.arc(this.px, this.py, LURE_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // 漩涡范围提示
    if (this.vortexT > 0) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#8fd0c9';
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        const a0 = t * 5 + (i * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.arc(this.px, this.py, VORTEX_R * (0.45 + i * 0.22), a0, a0 + Math.PI * 0.9);
        ctx.stroke();
      }
      ctx.restore();
    }
    // 护盾气泡
    if (this.shield > 0 && !this.dead) {
      ctx.save();
      ctx.globalAlpha = 0.55 + 0.2 * Math.sin(t * 3);
      ctx.fillStyle = 'rgba(170,220,235,0.08)';
      ctx.strokeStyle = 'rgba(160,220,235,0.75)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(this.px, this.py, this.size * 1.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(this.px, this.py, this.size * 1.45, Math.PI * 1.15, Math.PI * 1.5);
      ctx.stroke();
      ctx.restore();
    }
    // 棘刺
    if (this.spikesT > 0 && !this.dead) {
      ctx.save();
      ctx.fillStyle = '#e8845f';
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + t * 0.6;
        const bx = this.px + Math.cos(a) * this.size * 1.3;
        const by = this.py + Math.sin(a) * this.size * 1.3;
        const tx = this.px + Math.cos(a) * this.size * 1.85;
        const ty = this.py + Math.sin(a) * this.size * 1.85;
        const pa = a + Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(bx + Math.cos(pa) * this.size * 0.22, by + Math.sin(pa) * this.size * 0.22);
        ctx.lineTo(bx - Math.cos(pa) * this.size * 0.22, by - Math.sin(pa) * this.size * 0.22);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // 本体（狂暴金色放大 + 彩虹拖尾在 update 中产出；咀嚼缩放脉冲）
    let sz = this.size * (frenzy ? 1.28 : 1);
    if (this.chewT > 0) sz *= 1 + 0.12 * Math.sin((1 - this.chewT / 0.18) * Math.PI);
    if (this.spikesT > 0) sz *= 1.12;
    let alpha = 1;
    if (this.cloakT > 0) alpha = 0.4;
    if (this.invulnT > 0 && !this.dead) alpha = 0.55 + 0.35 * Math.sin(t * 18);
    if (this.dead) alpha = clamp(this.deathT / 1.4, 0, 1) * 0.9;
    this.renderer.draw(ctx, this.opts.player, this.px, this.py, sz, this.dirX, t, {
      rainbow: frenzy,
      alpha,
    });
  }
}
