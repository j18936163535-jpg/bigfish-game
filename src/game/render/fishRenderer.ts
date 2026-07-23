// =============================================================
// 大鱼吃小鱼 · 鱼渲染器
// 契约（plan.md §2.1）：
//   - preload 预加载精灵；永不因缺图 throw。
//   - draw：图已加载 → 按 facing/dirX 翻转 + 正弦摆动；
//     图缺失 → 程序化矢量鱼兜底（按 id 哈希稳定配色/造型）。
//   - size 参数为碰撞半径，视觉直径 ≈ 2.6×半径。
//   - opts.rainbow=true 叠加彩虹 hue-rotate 辉光；opts.alpha 生效。
// 幂等说明：无全局事件监听、无定时器；preload 可重复调用（去重），
//   符合 React StrictMode 双跑要求。
// =============================================================
import type { FishSpec, PlayerFishSpec } from '../types';

type LoadState = 'loading' | 'ok' | 'fail';
interface ImgEntry {
  img: HTMLImageElement;
  state: LoadState;
}

/** 视觉直径 ≈ 2.6 × 碰撞半径（plan §3 体型表注） */
const VISUAL_DIAMETER_RATIO = 2.6;
/** 兜底矢量鱼的离屏画布基准边长（px） */
const FALLBACK_BASE = 160;

/** FNV-1a 字符串哈希：配色/造型/摆动相位全部由它决定，稳定可复现。 */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class FishRenderer {
  private images = new Map<string, ImgEntry>();
  private fallbacks = new Map<string, HTMLCanvasElement>();

  constructor() {
    // 无状态初始化；缓存随实例存活。
  }

  /**
   * 预加载一组精灵。逐图独立成败：失败只标记 'fail'，绝不 reject，
   * 调用方拿到的 Promise 保证 resolve。
   */
  preload(specs: { sprite: string }[]): Promise<void> {
    const jobs = specs.map((s) => this.ensure(s.sprite));
    return Promise.all(jobs).then(() => undefined);
  }

  /** 懒加载入口：已缓存直接返回 promise；未见过则启动加载。 */
  private ensure(sprite: string): Promise<void> {
    const cached = this.images.get(sprite);
    if (cached) {
      return cached.state === 'loading'
        ? new Promise<void>((resolve) => {
            const done = () => resolve();
            cached.img.addEventListener('load', done, { once: true });
            cached.img.addEventListener('error', done, { once: true });
          })
        : Promise.resolve();
    }
    const img = new Image();
    const entry: ImgEntry = { img, state: 'loading' };
    this.images.set(sprite, entry);
    return new Promise<void>((resolve) => {
      img.onload = () => {
        entry.state = 'ok';
        resolve();
      };
      img.onerror = () => {
        entry.state = 'fail'; // 缺图不抛错，draw 走程序化兜底
        resolve();
      };
      img.src = sprite;
    });
  }

  /**
   * 画一条鱼。
   * @param size  碰撞半径（世界像素）；视觉直径 = size×2.6
   * @param dirX  水平移动方向（正负决定翻转，≈0 保持 facing 原向）
   * @param t     全局时间（秒），驱动正弦摆动
   */
  draw(
    ctx: CanvasRenderingContext2D,
    spec: FishSpec | PlayerFishSpec,
    x: number,
    y: number,
    size: number,
    dirX: number,
    t: number,
    opts?: { rainbow?: boolean; alpha?: number },
  ): void {
    const w = size * VISUAL_DIAMETER_RATIO; // 视觉宽度（≈视觉直径）
    const hash = hashStr(spec.id);
    const phase = (hash % 628) / 100; // 0..6.28，防全屏同频摆尾
    const wiggle = Math.sin(t * 7 + phase) * 0.08; // 摆动 ±0.08rad
    const shear = Math.sin(t * 7 + phase + Math.PI / 2) * 0.05; // 尾向轻微 skew
    const flip = spec.facing === 'left' ? dirX > 0.01 : dirX < -0.01;
    const rainbow = opts?.rainbow === true;
    const alpha = opts?.alpha ?? 1;

    // 图片来源：已加载 PNG，否则程序化兜底（缺图永不 throw）
    const entry = this.images.get(spec.sprite) ?? null;
    if (!entry) void this.ensure(spec.sprite); // 懒启动加载，本帧先用兜底
    const usePng = entry !== null && entry.state === 'ok';
    let h: number;
    if (usePng) {
      const img = entry.img;
      const nw = img.naturalWidth || 1;
      const nh = img.naturalHeight || 1;
      h = w * (nh / nw);
    } else {
      h = w; // 兜底画布为方形
    }

    ctx.save();
    try {
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      if (flip) ctx.scale(-1, 1);
      ctx.rotate(wiggle);
      ctx.transform(1, 0, shear, 1, 0, 0);

      // 彩虹辉光：鱼身后铺一层流转的彩虹光圈
      if (rainbow) {
        const hue = Math.round((t * 180) % 360);
        const r = w * 0.72;
        const glow = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
        glow.addColorStop(0, `hsla(${hue}, 90%, 70%, 0.40)`);
        glow.addColorStop(0.55, `hsla(${(hue + 90) % 360}, 90%, 65%, 0.22)`);
        glow.addColorStop(1, `hsla(${(hue + 180) % 360}, 90%, 60%, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // hue-rotate 变色（支持 ctx.filter 的环境；不支持则仅保留辉光）
      const filterOk = 'filter' in ctx;
      if (rainbow && filterOk) {
        ctx.filter = `hue-rotate(${Math.round((t * 240) % 360)}deg) saturate(1.5) brightness(1.08)`;
      }
      if (usePng) {
        ctx.drawImage(entry.img, -w / 2, -h / 2, w, h);
      } else {
        const fb = this.fallbackOf(spec, hash);
        ctx.drawImage(fb, -w / 2, -h / 2, w, h);
      }
      if (rainbow && filterOk) ctx.filter = 'none';
    } finally {
      ctx.restore();
    }
  }

  /** 取该 spec 的程序化兜底图（离屏 canvas，按 id 缓存，一次绘制多帧复用）。 */
  private fallbackOf(spec: FishSpec | PlayerFishSpec, hash: number): HTMLCanvasElement {
    const hit = this.fallbacks.get(spec.id);
    if (hit) return hit;
    const cv = paintVectorFish(spec, hash);
    this.fallbacks.set(spec.id, cv);
    return cv;
  }
}

// =============================================================
// 程序化矢量鱼：椭圆身 + 三角尾 + 鳍 + 眼 + 条纹
// 设计目标：31 种 NPC + 6 条玩家鱼肉眼可区分、风格统一可爱。
// 区分维度：主色相（id 哈希）× 4 种剪影 × 条纹数 × 尾鳍深浅。
// 头朝左（与美术 PNG 的 facing:'left' 约定一致）。
// =============================================================
function paintVectorFish(
  spec: FishSpec | PlayerFishSpec,
  hash: number,
): HTMLCanvasElement {
  const B = FALLBACK_BASE;
  const cv = document.createElement('canvas');
  cv.width = B;
  cv.height = B;
  const g = cv.getContext('2d');
  if (!g) return cv;

  const isRainbow = 'special' in spec && spec.special === 'rainbow';
  const hue = hash % 360;
  const hue2 = (hue + 38 + (hash % 24)) % 360;
  const variant = (hash >>> 8) % 4; // 0 标准 / 1 胖圆 / 2 修长 / 3 高扁
  const stripeCount = (hash >>> 12) % 4; // 0..3
  const bellyLight = 62 + (hash % 8);

  // 剪影参数
  let rx = 50;
  let ry = 30;
  if (variant === 1) {
    rx = 43;
    ry = 37;
  } else if (variant === 2) {
    rx = 58;
    ry = 22;
  } else if (variant === 3) {
    rx = 46;
    ry = 35;
  }
  const cx = 74;
  const cy = 82;

  const bodyPath = () => {
    g.beginPath();
    g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  };

  // ---- 尾鳍（三角/浅叉，头左尾右） ----
  const tailX = cx + rx - 6;
  const tailLen = 26 + (hash % 10);
  g.fillStyle = `hsl(${hue2}, 58%, 48%)`;
  g.beginPath();
  g.moveTo(tailX, cy);
  g.lineTo(tailX + tailLen, cy - ry * 0.85);
  g.lineTo(tailX + tailLen * 0.72, cy);
  g.lineTo(tailX + tailLen, cy + ry * 0.85);
  g.closePath();
  g.fill();

  // ---- 背鳍 ----
  g.fillStyle = `hsl(${hue2}, 55%, 45%)`;
  g.beginPath();
  g.moveTo(cx - rx * 0.35, cy - ry * 0.82);
  g.quadraticCurveTo(cx + rx * 0.05, cy - ry * 1.5, cx + rx * 0.45, cy - ry * 0.75);
  g.closePath();
  g.fill();

  // ---- 身体 ----
  const grad = g.createLinearGradient(cx - rx, cy - ry, cx + rx, cy + ry);
  if (isRainbow) {
    // 彩虹鱼：七彩色带渐变，无图也一眼可认
    const stops = [0, 45, 100, 140, 200, 265, 320];
    stops.forEach((hh, i) => {
      grad.addColorStop(i / (stops.length - 1), `hsl(${hh}, 78%, 60%)`);
    });
  } else {
    grad.addColorStop(0, `hsl(${hue}, 56%, ${bellyLight}%)`);
    grad.addColorStop(1, `hsl(${hue}, 60%, 46%)`);
  }
  bodyPath();
  g.fillStyle = grad;
  g.fill();

  // ---- 条纹（裁剪进身体，彩虹鱼用白色半透明波纹） ----
  if (stripeCount > 0 || isRainbow) {
    const n = isRainbow ? 4 : stripeCount;
    g.save();
    bodyPath();
    g.clip();
    g.fillStyle = isRainbow
      ? 'rgba(255,255,255,0.38)'
      : `hsla(${(hue + 180) % 360}, 45%, 34%, 0.42)`;
    for (let i = 0; i < n; i++) {
      const sx = cx - rx * 0.15 + (i * rx * 1.05) / Math.max(n, 1);
      g.save();
      g.translate(sx, cy);
      g.rotate(0.18);
      const sw = 5 + ((hash >>> (4 + i)) % 5);
      g.fillRect(-sw / 2, -ry - 4, sw, ry * 2 + 8);
      g.restore();
    }
    g.restore();
  }

  // ---- 腹部高光 ----
  g.save();
  bodyPath();
  g.clip();
  g.fillStyle = 'rgba(255,255,255,0.20)';
  g.beginPath();
  g.ellipse(cx - rx * 0.1, cy + ry * 0.45, rx * 0.72, ry * 0.42, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();

  // ---- 胸鳍 ----
  g.fillStyle = `hsla(${hue2}, 58%, 46%, 0.9)`;
  g.beginPath();
  g.ellipse(cx - rx * 0.05, cy + ry * 0.28, 13, 7, -0.6, 0, Math.PI * 2);
  g.fill();

  // ---- 描边（柔和深色，统一可爱风） ----
  bodyPath();
  g.strokeStyle = `hsla(${hue}, 45%, 24%, 0.55)`;
  g.lineWidth = 2.5;
  g.stroke();

  // ---- 眼睛（头在左） ----
  const ex = cx - rx * 0.55;
  const ey = cy - ry * 0.22;
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(ex, ey, 7.2, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#17242c';
  g.beginPath();
  g.arc(ex - 1.4, ey + 0.4, 3.6, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(ex - 2.2, ey - 1.2, 1.4, 0, Math.PI * 2);
  g.fill();

  // ---- 腮红（可爱度 +1） ----
  g.fillStyle = 'rgba(232, 132, 95, 0.35)'; // 珊瑚暖色，符合美术方针
  g.beginPath();
  g.arc(ex + 2.5, ey + 9.5, 4.2, 0, Math.PI * 2);
  g.fill();

  return cv;
}
