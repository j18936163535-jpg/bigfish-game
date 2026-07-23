// =============================================================
// 引擎 · 相机
// - 跟随目标平滑插值（lerp 系数可调，帧率无关）
// - 按玩家 tier 平滑缩放：tier1=1.0 → tier8≈0.45，中间平滑曲线
//   （setTier 支持小数 tier，供玩法层在成长插值时连续调用）
// - 世界↔屏幕坐标变换（屏幕坐标为 CSS 像素）
// - resize 适配 devicePixelRatio
// =============================================================

export class Camera {
  /** 视野中心（世界坐标） */
  x = 0;
  y = 0;
  /** 当前缩放（1 = 1 世界像素 : 1 CSS 像素） */
  zoom = 1;
  /** 跟随平滑系数 /s，越大越紧；可调 */
  lerp = 6;
  /** 缩放平滑系数 /s；可调 */
  zoomLerp = 3;
  /** 视口尺寸（CSS 像素） */
  viewW = 1;
  viewH = 1;
  dpr = 1;

  private targetZoom = 1;
  private canvas: HTMLCanvasElement | null = null;

  constructor(opts?: { lerp?: number; zoomLerp?: number }) {
    if (opts?.lerp !== undefined) this.lerp = opts.lerp;
    if (opts?.zoomLerp !== undefined) this.zoomLerp = opts.zoomLerp;
  }

  /** tier → 目标缩放：tier1=1.0，tier8=0.45，幂曲线平滑过渡 */
  static zoomForTier(tier: number): number {
    const t = Math.min(8, Math.max(1, tier));
    const k = (t - 1) / 7;
    return 1 - 0.55 * Math.pow(k, 0.85);
  }

  /** 绑定 canvas 并按 dpr 做一次 resize */
  bind(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.resize();
  }

  /** 按 clientWidth/Height × devicePixelRatio 重设画布像素尺寸（幂等） */
  resize(): void {
    const c = this.canvas;
    if (!c) return;
    this.dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const w = c.clientWidth || window.innerWidth;
    const h = c.clientHeight || window.innerHeight;
    this.viewW = w;
    this.viewH = h;
    const pw = Math.round(w * this.dpr);
    const ph = Math.round(h * this.dpr);
    if (c.width !== pw) c.width = pw;
    if (c.height !== ph) c.height = ph;
  }

  /** 立即定位（开局/重生用，无平滑） */
  snapTo(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  /** 平滑跟随目标点（帧率无关指数插值） */
  follow(tx: number, ty: number, dt: number): void {
    const k = 1 - Math.exp(-this.lerp * dt);
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
  }

  /** 按玩家 tier 设定目标缩放（实际缩放在 update 中平滑逼近） */
  setTier(tier: number): void {
    this.targetZoom = Camera.zoomForTier(tier);
  }

  /** 每帧推进缩放插值 */
  update(dt: number): void {
    const k = 1 - Math.exp(-this.zoomLerp * dt);
    this.zoom += (this.targetZoom - this.zoom) * k;
  }

  /** 世界坐标 → 屏幕坐标（CSS 像素） */
  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return {
      x: (wx - this.x) * this.zoom + this.viewW / 2,
      y: (wy - this.y) * this.zoom + this.viewH / 2,
    };
  }

  /** 屏幕坐标（CSS 像素）→ 世界坐标 */
  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.viewW / 2) / this.zoom + this.x,
      y: (sy - this.viewH / 2) / this.zoom + this.y,
    };
  }

  /**
   * 将 ctx 变换到世界空间（含 dpr 与 zoom）。
   * 之后可直接用世界坐标绘制；配对调用 end() 恢复。
   */
  begin(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    const z = this.zoom * this.dpr;
    ctx.setTransform(
      z, 0, 0, z,
      this.dpr * (this.viewW / 2 - this.x * this.zoom),
      this.dpr * (this.viewH / 2 - this.y * this.zoom),
    );
  }

  end(ctx: CanvasRenderingContext2D): void {
    ctx.restore();
  }

  /** 世界坐标下的可视外接圆半径（离屏剔除用） */
  viewRadius(): number {
    return Math.hypot(this.viewW, this.viewH) / (2 * this.zoom);
  }
}
