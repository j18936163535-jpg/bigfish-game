// =============================================================
// 引擎 · 游戏主循环
// rAF 驱动；dt 单位秒，clamp 到 0.05；页面 hidden 自动暂停、
// visible 自动恢复（且恢复时重置时间基准，避免 dt 突跳）。
// 返回停止函数，停止函数幂等（StrictMode 双跑安全）。
// =============================================================

const MAX_DT = 0.05;

export function startLoop(cb: (dt: number) => void): () => void {
  let raf = 0;
  let last = 0;
  let running = true;
  let hidden = typeof document !== 'undefined' ? document.hidden : false;

  const frame = (now: number) => {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (hidden) {
      last = 0; // 暂停期间不计时
      return;
    }
    if (last === 0) {
      last = now; // 首帧/恢复首帧不产生 dt
      return;
    }
    let dt = (now - last) / 1000;
    last = now;
    if (dt <= 0) return;
    if (dt > MAX_DT) dt = MAX_DT;
    cb(dt);
  };

  const onVisibility = () => {
    hidden = document.hidden;
    last = 0; // 恢复时重置基准，杜绝卡顿后的大 dt
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility);
  }
  raf = requestAnimationFrame(frame);

  let stopped = false;
  return () => {
    if (stopped) return; // 幂等，重复调用安全
    stopped = true;
    running = false;
    cancelAnimationFrame(raf);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibility);
    }
  };
}
