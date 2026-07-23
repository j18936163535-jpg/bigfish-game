// =============================================================
// fx.ts — 场景内粒子对象池 + 程序化深海背景
// 契约缺口局部适配：plan §2.1 未约定 engine/particles 的 API，
// 本文件为 GameScene 自给实现（对象池粒子 + 代码绘制深海背景），
// 不依赖任何图片资源。视觉基调：低饱和深海（#0f3443→#081c26），
// 暖色（琥珀 #f2b25c / 珊瑚 #e8845f）点缀，无高饱和蓝紫渐变。
// =============================================================

export type FxKind = 'dot' | 'bubble' | 'ring';

interface FxParticle {
  alive: boolean;
  kind: FxKind;
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  size: number; growth: number;
  color: string;
}

const rand = (): number => Math.random();

/** 轻量粒子对象池：固定容量、环形复用，零分配热路径。 */
export class FxPool {
  private pool: FxParticle[] = [];
  private idx = 0;
  private cap: number;

  constructor(cap = 280) {
    this.cap = cap;
    for (let i = 0; i < cap; i++) {
      this.pool.push({
        alive: false, kind: 'dot', x: 0, y: 0, vx: 0, vy: 0,
        life: 0, maxLife: 1, size: 2, growth: 0, color: '#cfeef2',
      });
    }
  }

  private next(): FxParticle {
    const p = this.pool[this.idx];
    this.idx = (this.idx + 1) % this.cap;
    return p;
  }

  /** 光点/碎屑喷发 */
  spark(x: number, y: number, color: string, n = 6, speed = 120, life = 0.5, size = 3): void {
    for (let i = 0; i < n; i++) {
      const p = this.next();
      const a = rand() * Math.PI * 2;
      const sp = speed * (0.35 + rand() * 0.85);
      p.alive = true; p.kind = 'dot';
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
      p.life = p.maxLife = life * (0.6 + rand() * 0.7);
      p.size = size * (0.6 + rand() * 0.8); p.growth = 0;
      p.color = color;
    }
  }

  /** 吞食气泡 burst：一半光点 + 一半上浮气泡 */
  burst(x: number, y: number, color = '#cfeef2', n = 10, speed = 150, life = 0.6, size = 3): void {
    this.spark(x, y, color, Math.ceil(n / 2), speed, life, size);
    for (let i = 0; i < Math.floor(n / 2) + 1; i++) {
      const p = this.next();
      const a = rand() * Math.PI * 2;
      const sp = speed * (0.2 + rand() * 0.5);
      p.alive = true; p.kind = 'bubble';
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp - 30;
      p.life = p.maxLife = life * (0.8 + rand() * 0.8);
      p.size = size * (0.8 + rand() * 1.1); p.growth = 0;
      p.color = color;
    }
  }

  /** 扩散圆环（升级/爆炸/技能） */
  ring(x: number, y: number, color: string, maxR = 120, life = 0.5): void {
    const p = this.next();
    p.alive = true; p.kind = 'ring';
    p.x = x; p.y = y; p.vx = 0; p.vy = 0;
    p.life = p.maxLife = life;
    p.size = maxR * 0.15;
    p.growth = (maxR - p.size) / Math.max(0.01, life);
    p.color = color;
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'bubble') p.vy -= 70 * dt; // 气泡加速上浮
      if (p.kind === 'ring') p.size += p.growth * dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.pool) {
      if (!p.alive) continue;
      const a = Math.max(0, Math.min(1, p.life / p.maxLife));
      if (p.kind === 'dot') {
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'bubble') {
        ctx.globalAlpha = a * 0.75;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.globalAlpha = a * 0.85;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3.5 * a + 0.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  clear(): void {
    for (const p of this.pool) p.alive = false;
  }
}

// -------------------------------------------------------------
// 深海背景（纯代码绘制，随 tier 加深）
// -------------------------------------------------------------

type RGB = [number, number, number];

const lerp3 = (a: RGB, b: RGB, k: number): string =>
  `rgb(${Math.round(a[0] + (b[0] - a[0]) * k)},${Math.round(a[1] + (b[1] - a[1]) * k)},${Math.round(a[2] + (b[2] - a[2]) * k)})`;

/**
 * 竖屏深海渐变背景：tier 越高越深越暗；
 * 顶部微弱暖色光柱 + 四周暗角。w/h 为 CSS 像素。
 */
export function drawSeaBackground(
  ctx: CanvasRenderingContext2D, w: number, h: number, tier: number, t: number,
): void {
  const k = Math.max(0, Math.min(1, (tier - 1) / 7));
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, lerp3([15, 52, 67], [5, 17, 25], k));   // #0f3443 → 更深
  g.addColorStop(1, lerp3([8, 28, 38], [2, 7, 11], k));      // #081c26 → 更深
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // 海面光柱（随深度衰减，极低透明度暖色）
  ctx.save();
  ctx.globalAlpha = 0.05 * (1 - k * 0.7);
  ctx.fillStyle = '#f2d8a8';
  for (let i = 0; i < 3; i++) {
    const bx = w * (0.18 + i * 0.3) + Math.sin(t * 0.12 + i * 1.7) * 26;
    ctx.beginPath();
    ctx.moveTo(bx, -20);
    ctx.lineTo(bx + 90, -20);
    ctx.lineTo(bx + 210, h + 20);
    ctx.lineTo(bx + 40, h + 20);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // 暗角（越深海越重）
  const v = ctx.createRadialGradient(
    w / 2, h / 2, Math.min(w, h) * 0.35,
    w / 2, h / 2, Math.max(w, h) * 0.78,
  );
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, `rgba(2,8,12,${0.32 + k * 0.22})`);
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}
