// =============================================================
// 引擎 · 输入
// - Joystick：在 host 内自建半透明虚拟摇杆（固定于左下），
//   底盘 132px / 摇杆头 58px，触控热区 164px（比视觉大一圈，
//   全透明 hit 层承接事件，视觉层不放大），pointer events，
//   多指时只认领落在摇杆上的第一指（其余手指留给技能键等），
//   松手回中，dx/dy 归一化 -1..1，0.12 死区。内联样式，destroy 清理。
// - bindKeyboard：WASD/方向键，桌面端备用。
// 坐标约定：dy/vy 向下为正（与 canvas 世界坐标一致）。
// =============================================================

const BASE_SIZE = 132;
const KNOB_SIZE = 58;
const HIT_SIZE = 164;   // 触控热区（透明，比视觉大一圈）
const TRAVEL = 44;      // 摇杆头最大偏移 px
const DEAD = 0.12;      // 死区

export class Joystick {
  private _dx = 0;
  private _dy = 0;
  private _active = false;

  get dx(): number { return this._dx; }
  get dy(): number { return this._dy; }
  get active(): boolean { return this._active; }

  private hit: HTMLDivElement;
  private base: HTMLDivElement;
  private knob: HTMLDivElement;
  private pointerId: number | null = null;
  private centerX = 0;
  private centerY = 0;
  private destroyed = false;

  constructor(host: HTMLElement) {
    if (getComputedStyle(host).position === 'static') {
      host.style.position = 'relative';
    }

    // 触控热区（全透明，比视觉底盘大一圈，承接全部 pointer 事件）
    this.hit = document.createElement('div');
    const hs = this.hit.style;
    hs.position = 'absolute';
    hs.left = '14px';
    hs.bottom = 'calc(14px + env(safe-area-inset-bottom, 0px))';
    hs.width = `${HIT_SIZE}px`;
    hs.height = `${HIT_SIZE}px`;
    hs.borderRadius = '50%';
    hs.background = 'transparent';
    hs.touchAction = 'none';
    hs.userSelect = 'none';
    hs.setProperty('-webkit-user-select', 'none');
    hs.setProperty('-webkit-touch-callout', 'none');
    hs.zIndex = '10';
    hs.pointerEvents = 'auto';

    // 底盘（视觉层，居中于热区内，不承接事件）
    this.base = document.createElement('div');
    const bs = this.base.style;
    bs.position = 'absolute';
    bs.left = '50%';
    bs.top = '50%';
    bs.width = `${BASE_SIZE}px`;
    bs.height = `${BASE_SIZE}px`;
    bs.transform = 'translate(-50%, -50%)';
    bs.borderRadius = '50%';
    bs.background = 'rgba(210, 235, 240, 0.08)';
    bs.border = '1.5px solid rgba(210, 235, 240, 0.28)';
    bs.boxShadow = '0 0 12px rgba(8, 28, 38, 0.35) inset';
    bs.opacity = '0.35';
    bs.transition = 'opacity 150ms ease';
    bs.userSelect = 'none';
    bs.setProperty('-webkit-user-select', 'none');
    bs.pointerEvents = 'none'; // 事件全由热区接管

    // 摇杆头（琥珀暖色点缀，契合深海基调）
    this.knob = document.createElement('div');
    const ks = this.knob.style;
    ks.position = 'absolute';
    ks.left = '50%';
    ks.top = '50%';
    ks.width = `${KNOB_SIZE}px`;
    ks.height = `${KNOB_SIZE}px`;
    ks.borderRadius = '50%';
    ks.background = 'rgba(242, 178, 92, 0.55)';
    ks.border = '1.5px solid rgba(242, 178, 92, 0.85)';
    ks.boxShadow = '0 0 10px rgba(242, 178, 92, 0.35)';
    ks.transform = 'translate(-50%, -50%)';
    ks.pointerEvents = 'none'; // 事件全由底盘接管

    this.base.appendChild(this.knob);
    this.hit.appendChild(this.base);
    host.appendChild(this.hit);

    this.hit.addEventListener('pointerdown', this.onDown);
    this.hit.addEventListener('pointermove', this.onMove);
    this.hit.addEventListener('pointerup', this.onUp);
    this.hit.addEventListener('pointercancel', this.onUp);
    this.hit.addEventListener('contextmenu', this.onContextMenu);
  }

  private onContextMenu = (e: Event): void => {
    e.preventDefault(); // 禁长按弹菜单
  };

  private onDown = (e: PointerEvent): void => {
    if (this.destroyed) return;
    if (this.pointerId !== null) return; // 多指时只认第一指，其余留给技能键等
    this.pointerId = e.pointerId;
    try { this.hit.setPointerCapture(e.pointerId); } catch { /* noop */ }
    const r = this.base.getBoundingClientRect();
    this.centerX = r.left + r.width / 2;
    this.centerY = r.top + r.height / 2;
    this._active = true;
    this.base.style.opacity = '0.6';
    this.knob.style.transition = 'none';
    this.track(e.clientX, e.clientY);
    e.preventDefault();
  };

  private onMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    this.track(e.clientX, e.clientY);
    e.preventDefault();
  };

  private onUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this._active = false;
    this._dx = 0;
    this._dy = 0;
    this.base.style.opacity = '0.35';
    // 松手回中（带过渡）
    this.knob.style.transition = 'transform 160ms ease';
    this.knob.style.transform = 'translate(-50%, -50%)';
  };

  private track(clientX: number, clientY: number): void {
    let ox = clientX - this.centerX;
    let oy = clientY - this.centerY;
    const len = Math.hypot(ox, oy);
    if (len > TRAVEL) {
      ox = (ox / len) * TRAVEL;
      oy = (oy / len) * TRAVEL;
    }
    const mag = Math.min(1, Math.hypot(ox, oy) / TRAVEL);
    if (mag < DEAD) {
      this._dx = 0;
      this._dy = 0;
    } else {
      // 死区外重标定，避免越过死区时数值突跳
      const m = (mag - DEAD) / (1 - DEAD);
      const inv = len > 0 ? 1 / len : 0;
      this._dx = ox * inv * m;
      this._dy = oy * inv * m;
    }
    this.knob.style.transform =
      `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px))`;
  }

  destroy(): void {
    if (this.destroyed) return; // 幂等，StrictMode 双跑安全
    this.destroyed = true;
    this.hit.removeEventListener('pointerdown', this.onDown);
    this.hit.removeEventListener('pointermove', this.onMove);
    this.hit.removeEventListener('pointerup', this.onUp);
    this.hit.removeEventListener('pointercancel', this.onUp);
    this.hit.removeEventListener('contextmenu', this.onContextMenu);
    this.hit.remove();
    this._dx = 0;
    this._dy = 0;
    this._active = false;
  }
}

// -------------------------------------------------------------
// 桌面端键盘输入：WASD / 方向键。返回采样函数与销毁函数。
// -------------------------------------------------------------
export function bindKeyboard(): {
  vx: () => number;
  vy: () => number;
  destroy: () => void;
} {
  const held = new Set<'l' | 'r' | 'u' | 'd'>();
  let destroyed = false;

  const mapKey = (key: string): 'l' | 'r' | 'u' | 'd' | null => {
    switch (key) {
      case 'a': case 'A': case 'ArrowLeft': return 'l';
      case 'd': case 'D': case 'ArrowRight': return 'r';
      case 'w': case 'W': case 'ArrowUp': return 'u';
      case 's': case 'S': case 'ArrowDown': return 'd';
      default: return null;
    }
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    const k = mapKey(e.key);
    if (!k) return;
    held.add(k);
    if (e.key.startsWith('Arrow')) e.preventDefault(); // 防页面滚动
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    const k = mapKey(e.key);
    if (k) held.delete(k);
  };
  const onBlur = (): void => held.clear(); // 失焦清空，防按键卡死

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  const sample = (): { x: number; y: number } => {
    const x = (held.has('r') ? 1 : 0) - (held.has('l') ? 1 : 0);
    const y = (held.has('d') ? 1 : 0) - (held.has('u') ? 1 : 0);
    if (x !== 0 && y !== 0) {
      const inv = 1 / Math.SQRT2; // 对角线归一化
      return { x: x * inv, y: y * inv };
    }
    return { x, y };
  };

  return {
    vx: () => sample().x,
    vy: () => sample().y,
    destroy: () => {
      if (destroyed) return; // 幂等
      destroyed = true;
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      held.clear();
    },
  };
}
