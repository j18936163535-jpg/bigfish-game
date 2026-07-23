// =============================================================
// 引擎 · 对象池粒子系统
// kind:
//   bubble 上升小气泡
//   glow   发光尘（琥珀暖色）
//   coin   金色弹跳圆点
//   spark  放射短线
//   ring   扩散圆环
//   suck   向目标点收拢的光点（opts 需含 tx, ty；缺省按 glow 处理）
// 池上限 600，写满后按 FIFO 覆盖最旧粒子。
// draw(ctx, camera) 约定：ctx 已通过 camera.begin() 进入世界空间，
// camera 仅用于离屏剔除。
// =============================================================

import type { Camera } from './camera';

export type ParticleKind = 'bubble' | 'glow' | 'coin' | 'spark' | 'ring' | 'suck';

export interface BurstOpts {
  tx?: number; ty?: number;   // suck 目标点
  color?: string;             // 覆盖主色
  size?: number;              // 尺寸倍率（默认 1）
  life?: number;              // 生命倍率（默认 1）
  speed?: number;             // 速度倍率（默认 1）
}

const MAX = 600;
const CULL_MARGIN = 80;

interface P {
  alive: boolean;
  kind: ParticleKind;
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  size: number;
  tx: number; ty: number;
  seed: number;
  color: string | null;
}

// 低饱和深海配色 + 暖色点缀
const COLORS = {
  bubble: '190, 225, 235',   // 淡青
  glow: '242, 178, 92',      // 琥珀
  coin: '242, 193, 78',      // 金
  spark: '232, 133, 95',     // 珊瑚
  ring: '215, 238, 242',     // 淡青白
  suck: '242, 178, 92',      // 琥珀
} as const;

export class Particles {
  private pool: P[] = [];
  private cursor = 0;

  constructor() {
    for (let i = 0; i < MAX; i++) {
      this.pool.push({
        alive: false, kind: 'glow',
        x: 0, y: 0, vx: 0, vy: 0,
        life: 0, maxLife: 1, size: 1,
        tx: 0, ty: 0, seed: 0, color: null,
      });
    }
  }

  burst(x: number, y: number, kind: ParticleKind, count: number, opts?: BurstOpts): void {
    // 契约缺口局部适配：suck 缺 tx/ty 时退化为 glow，避免光点原地瞬灭
    const k = (kind === 'suck' && (opts?.tx === undefined || opts?.ty === undefined))
      ? 'glow' : kind;
    const sizeMul = opts?.size ?? 1;
    const lifeMul = opts?.life ?? 1;
    const spdMul = opts?.speed ?? 1;
    const n = Math.max(0, Math.round(count));
    for (let i = 0; i < n; i++) {
      this.spawn(x, y, k, opts, sizeMul, lifeMul, spdMul);
    }
  }

  private spawn(
    x: number, y: number, kind: ParticleKind,
    opts: BurstOpts | undefined,
    sizeMul: number, lifeMul: number, spdMul: number,
  ): void {
    // 环形写入：池满时自然覆盖最旧粒子
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % MAX;

    p.alive = true;
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.vx = 0;
    p.vy = 0;
    p.tx = opts?.tx ?? x;
    p.ty = opts?.ty ?? y;
    p.seed = Math.random() * Math.PI * 2;
    p.color = opts?.color ?? null;

    switch (kind) {
      case 'bubble': {
        p.maxLife = p.life = (0.8 + Math.random() * 0.8) * lifeMul;
        p.size = (2 + Math.random() * 3) * sizeMul;
        p.vx = (Math.random() - 0.5) * 24 * spdMul;
        p.vy = -(30 + Math.random() * 40) * spdMul; // 上升（y 向下为正）
        break;
      }
      case 'glow': {
        p.maxLife = p.life = (0.5 + Math.random() * 0.5) * lifeMul;
        p.size = (2 + Math.random() * 2.5) * sizeMul;
        const a = Math.random() * Math.PI * 2;
        const s = (15 + Math.random() * 35) * spdMul;
        p.vx = Math.cos(a) * s;
        p.vy = Math.sin(a) * s;
        break;
      }
      case 'coin': {
        p.maxLife = p.life = (0.7 + Math.random() * 0.5) * lifeMul;
        p.size = (3 + Math.random() * 2) * sizeMul;
        const a = Math.random() * Math.PI * 2;
        const s = (120 + Math.random() * 140) * spdMul;
        p.vx = Math.cos(a) * s;
        p.vy = Math.sin(a) * s - 120 * spdMul; // 先向上抛，再受重力弹跳
        break;
      }
      case 'spark': {
        p.maxLife = p.life = (0.25 + Math.random() * 0.2) * lifeMul;
        p.size = (6 + Math.random() * 8) * sizeMul; // 线长基数
        const a = Math.random() * Math.PI * 2;
        const s = (150 + Math.random() * 230) * spdMul;
        p.vx = Math.cos(a) * s;
        p.vy = Math.sin(a) * s;
        break;
      }
      case 'ring': {
        p.maxLife = p.life = (0.4 + Math.random() * 0.3) * lifeMul;
        p.size = (6 + Math.random() * 6) * sizeMul; // 初始半径
        p.vx = (120 + Math.random() * 120) * spdMul; // 扩散速度
        break;
      }
      case 'suck': {
        p.maxLife = p.life = 1.4 * lifeMul;
        p.size = (2 + Math.random() * 2) * sizeMul;
        // 起点散开在 (x,y) 周围，向 (tx,ty) 收拢
        const a = Math.random() * Math.PI * 2;
        const r = 30 + Math.random() * 50;
        p.x = x + Math.cos(a) * r;
        p.y = y + Math.sin(a) * r;
        break;
      }
    }
  }

  update(dt: number): void {
    for (let i = 0; i < MAX; i++) {
      const p = this.pool[i];
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; continue; }

      switch (p.kind) {
        case 'bubble': {
          // 上升 + 正弦摆动
          p.x += (p.vx + Math.sin(p.seed + p.life * 6) * 14) * dt;
          p.y += p.vy * dt;
          break;
        }
        case 'glow': {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vx *= 1 - 2.5 * dt;
          p.vy *= 1 - 2.5 * dt;
          break;
        }
        case 'coin': {
          p.vy += 520 * dt; // 重力
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vx *= 1 - 1.8 * dt;
          break;
        }
        case 'spark': {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vx *= 1 - 4 * dt;
          p.vy *= 1 - 4 * dt;
          break;
        }
        case 'ring': {
          p.size += p.vx * dt; // 半径扩散
          break;
        }
        case 'suck': {
          const dx = p.tx - p.x;
          const dy = p.ty - p.y;
          const d = Math.hypot(dx, dy);
          if (d < 12) { p.alive = false; continue; } // 到达即灭
          const accel = 900;
          p.vx += (dx / d) * accel * dt;
          p.vy += (dy / d) * accel * dt;
          const sp = Math.hypot(p.vx, p.vy);
          const cap = 420;
          if (sp > cap) {
            p.vx = (p.vx / sp) * cap;
            p.vy = (p.vy / sp) * cap;
          }
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          break;
        }
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, camera: Camera): void {
    // 离屏剔除
    const hw = camera.viewW / (2 * camera.zoom) + CULL_MARGIN;
    const hh = camera.viewH / (2 * camera.zoom) + CULL_MARGIN;
    const cx = camera.x;
    const cy = camera.y;

    for (let i = 0; i < MAX; i++) {
      const p = this.pool[i];
      if (!p.alive) continue;
      if (p.x < cx - hw || p.x > cx + hw || p.y < cy - hh || p.y > cy + hh) continue;

      const t = p.life / p.maxLife; // 1 → 0
      const rgb = p.color ?? COLORS[p.kind];

      switch (p.kind) {
        case 'bubble': {
          ctx.globalAlpha = Math.min(1, t * 1.6) * 0.75;
          ctx.strokeStyle = `rgba(${rgb}, 1)`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case 'glow': case 'suck': {
          const a = p.kind === 'suck' ? Math.min(1, t * 2) : t;
          ctx.globalAlpha = a * 0.9;
          ctx.fillStyle = `rgba(${rgb}, 1)`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          // 外层柔光
          ctx.globalAlpha = a * 0.25;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 2.4, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'coin': {
          ctx.globalAlpha = Math.min(1, t * 2);
          ctx.fillStyle = `rgba(${rgb}, 1)`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = Math.min(1, t * 2) * 0.8;
          ctx.strokeStyle = 'rgba(140, 95, 30, 1)';
          ctx.lineWidth = 1;
          ctx.stroke();
          break;
        }
        case 'spark': {
          ctx.globalAlpha = t;
          ctx.strokeStyle = `rgba(${rgb}, 1)`;
          ctx.lineWidth = 2;
          ctx.lineCap = 'round';
          const len = p.size * (0.4 + t * 0.6);
          const sp = Math.hypot(p.vx, p.vy) || 1;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + (p.vx / sp) * len, p.y + (p.vy / sp) * len);
          ctx.stroke();
          break;
        }
        case 'ring': {
          ctx.globalAlpha = t * 0.85;
          ctx.strokeStyle = `rgba(${rgb}, 1)`;
          ctx.lineWidth = 1.5 + t * 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  clear(): void {
    for (let i = 0; i < MAX; i++) this.pool[i].alive = false;
  }
}
