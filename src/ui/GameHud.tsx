// =============================================================
// 大鱼吃小鱼 · 局内 HUD（plan.md §0）
// 顶部：分数/金币/tier 进度条；右下：技能大圆钮（冷却扫圈+秒数）+
// 炸弹小钮（数量为 0 隐藏）；左上：暂停钮（弹「继续/结束本局」）；
// buff 图标横排倒计时；combo 大字弹出；破盾/复活全屏提示字。
// 说明：技能/炸弹音效由 GameScene 自身负责，HUD 不重复播放。
// =============================================================
import { useEffect, useRef, useState } from 'react';
import { audio } from '../game/audio';
import type { HudState } from '../game/types';

export interface GameHudProps {
  hud: HudState;
  paused: boolean;
  onUseSkill(): void;
  onUseBomb(): void;
  onPause(): void;
  onResume(): void;
  /** 结束本局（主动 quit）。 */
  onQuit(): void;
}

export default function GameHud({
  hud,
  paused,
  onUseSkill,
  onUseBomb,
  onPause,
  onResume,
  onQuit,
}: GameHudProps) {
  const [flash, setFlash] = useState<string | null>(null);
  const prevHud = useRef<HudState | null>(null);

  // 破盾 / 复活瞬间的全屏提示字（由 HudState 数值下降边沿检测）
  useEffect(() => {
    const p = prevHud.current;
    if (p && !paused) {
      if (hud.shield < p.shield) setFlash('护盾破碎！');
      else if (hud.revives < p.revives) setFlash('图腾复活！');
    }
    prevHud.current = hud;
  }, [hud, paused]);

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 1300);
    return () => window.clearTimeout(t);
  }, [flash]);

  const cdFrac =
    hud.skill.cdMax > 0 ? Math.max(0, Math.min(1, hud.skill.cd / hud.skill.cdMax)) : 0;
  const cdSec = Math.ceil(hud.skill.cd);
  const tierPct = Math.round(Math.max(0, Math.min(1, hud.progress)) * 100);

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <style>{CSS}</style>

      {/* 顶部：暂停 + 分数/金币 + tier 进度 */}
      <div className="safe-top safe-x absolute inset-x-0 top-0 px-3 pt-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="hud-pause pointer-events-auto"
            onClick={() => {
              audio.play('ui');
              onPause();
            }}
          >
            ⏸
          </button>
          <div className="flex flex-1 items-center gap-3 rounded-full bg-black/30 px-4 py-1.5 backdrop-blur-sm">
            <span className="text-lg font-extrabold tabular-nums text-[#f5e7c8]">
              {hud.score}
            </span>
            <span className="text-sm font-semibold tabular-nums text-[#f2b25c]">
              🪙{hud.coins}
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              {hud.shield > 0 && (
                <span className="text-sm" title={`护盾 ×${hud.shield}`}>
                  🛡️{hud.shield > 1 ? `×${hud.shield}` : ''}
                </span>
              )}
              {hud.revives > 0 && (
                <span className="text-sm" title={`可复活 ×${hud.revives}`}>
                  🗿×{hud.revives}
                </span>
              )}
            </div>
          </div>
        </div>
        {/* tier 进度条 */}
        <div className="mt-1.5 flex items-center gap-2 px-1">
          <span className="text-[10px] font-bold text-[#9db8bf]">
            T{hud.tier}
          </span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#4d8fa3] to-[#f2b25c] transition-[width] duration-300"
              style={{ width: `${tierPct}%` }}
            />
          </div>
          <span className="text-[10px] font-bold text-[#9db8bf]">
            {hud.tier < 8 ? `T${hud.tier + 1}` : 'MAX'}
          </span>
        </div>
      </div>

      {/* buff 图标横排（顶部条下方） */}
      {hud.buffs.length > 0 && (
        <div className="safe-x absolute left-0 right-0 top-20 flex justify-center gap-2 px-3">
          {hud.buffs.map((b) => (
            <span
              key={b.id}
              className="rounded-full bg-black/35 px-2.5 py-1 text-xs font-semibold text-[#e8f1f2] backdrop-blur-sm"
            >
              {b.icon}
              <span className="ml-1 tabular-nums">{Math.ceil(b.remain)}s</span>
            </span>
          ))}
        </div>
      )}

      {/* combo 弹出大字 */}
      {hud.combo && hud.combo.count >= 2 && (
        <div
          key={hud.combo.count}
          className="hud-combo absolute left-1/2 top-[30%] -translate-x-1/2"
        >
          {hud.combo.count} 连吃！
        </div>
      )}

      {/* 破盾 / 复活全屏提示 */}
      {flash && (
        <div className="hud-flash absolute inset-x-0 top-[42%] text-center">
          {flash}
        </div>
      )}

      {/* 右下：技能大圆钮 + 炸弹小钮 */}
      <div className="safe-bottom safe-right pointer-events-auto absolute bottom-6 right-5 flex flex-col items-center gap-3">
        {hud.bombs > 0 && (
          <button
            type="button"
            className="hud-bomb"
            onClick={onUseBomb}
            title="引爆炸弹"
          >
            💣
            <span className="hud-bomb-badge">{hud.bombs}</span>
          </button>
        )}
        <button
          type="button"
          className={`hud-skill ${hud.skill.active ? 'hud-skill-active' : ''} ${
            cdFrac > 0 ? '' : 'hud-skill-ready'
          }`}
          onClick={onUseSkill}
          title="技能"
        >
          <span className="text-2xl" aria-hidden>
            {hud.skill.icon}
          </span>
          {/* 冷却同心圆扫圈 */}
          {cdFrac > 0 && (
            <span
              className="hud-skill-cd"
              style={{
                background: `conic-gradient(rgba(8,28,38,.82) ${cdFrac * 360}deg, transparent ${cdFrac * 360}deg)`,
              }}
            >
              <span className="text-sm font-bold tabular-nums text-white/90">
                {cdSec}
              </span>
            </span>
          )}
        </button>
      </div>

      {/* 暂停遮罩菜单 */}
      {paused && (
        <div className="pointer-events-auto absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-black/60 backdrop-blur-[3px]">
          <div className="text-2xl font-bold tracking-[0.4em] text-[#f5e7c8]">
            已暂停
          </div>
          <button
            type="button"
            className="hud-menu-primary"
            onClick={() => {
              audio.play('ui');
              onResume();
            }}
          >
            ▶ 继续游戏
          </button>
          <button
            type="button"
            className="hud-menu-danger"
            onClick={() => {
              audio.play('ui');
              onQuit();
            }}
          >
            🏳️ 结束本局
          </button>
        </div>
      )}
    </div>
  );
}

const CSS = `
.hud-pause {
  display: flex; align-items: center; justify-content: center;
  width: 2.5rem; height: 2.5rem; border-radius: 9999px;
  background: rgba(0,0,0,.3); backdrop-filter: blur(4px);
  color: #e8f1f2; font-size: .95rem;
  transition: transform .15s ease, background .15s ease;
}
.hud-pause:active { transform: scale(.9); background: rgba(0,0,0,.5); }

.hud-skill {
  position: relative;
  display: flex; align-items: center; justify-content: center;
  width: 64px; height: 64px; border-radius: 9999px;
  background: rgba(15,52,67,.75);
  border: 2px solid rgba(242,178,92,.5);
  backdrop-filter: blur(4px);
  overflow: hidden;
  transition: transform .12s ease;
}
.hud-skill:active { transform: scale(.92); }
.hud-skill-ready {
  box-shadow: 0 0 16px rgba(242,178,92,.35);
}
.hud-skill-active {
  border-color: #f7cd8a;
  box-shadow: 0 0 26px rgba(242,178,92,.75), 0 0 60px rgba(242,178,92,.35);
  animation: hud-skill-pulse .7s ease-in-out infinite;
}
@keyframes hud-skill-pulse {
  0%,100% { box-shadow: 0 0 26px rgba(242,178,92,.75), 0 0 60px rgba(242,178,92,.35); }
  50% { box-shadow: 0 0 36px rgba(242,178,92,.95), 0 0 80px rgba(242,178,92,.5); }
}
.hud-skill-cd {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  border-radius: 9999px;
}

.hud-bomb {
  position: relative;
  display: flex; align-items: center; justify-content: center;
  width: 46px; height: 46px; border-radius: 9999px;
  background: rgba(15,52,67,.75);
  border: 1.5px solid rgba(232,132,95,.6);
  font-size: 1.15rem;
  backdrop-filter: blur(4px);
  transition: transform .12s ease;
}
.hud-bomb:active { transform: scale(.9); }
.hud-bomb-badge {
  position: absolute; top: -4px; right: -4px;
  min-width: 18px; height: 18px; padding: 0 4px;
  border-radius: 9999px;
  background: #e8845f; color: #081c26;
  font-size: 11px; font-weight: 800; line-height: 18px;
  text-align: center;
}

.hud-combo {
  font-size: 2.2rem; font-weight: 900; letter-spacing: .08em;
  color: #f2b25c;
  text-shadow: 0 0 18px rgba(242,178,92,.6), 0 3px 0 rgba(0,0,0,.5);
  animation: hud-combo-pop .8s cubic-bezier(.2,1.8,.4,1) both;
}
@keyframes hud-combo-pop {
  0% { transform: translateX(-50%) scale(.3); opacity: 0; }
  35% { transform: translateX(-50%) scale(1.15); opacity: 1; }
  70% { transform: translateX(-50%) scale(1); opacity: 1; }
  100% { transform: translateX(-50%) scale(1.05) translateY(-14px); opacity: 0; }
}

.hud-flash {
  font-size: 2rem; font-weight: 900; letter-spacing: .2em;
  color: #f5e7c8;
  text-shadow: 0 0 24px rgba(232,132,95,.8), 0 3px 0 rgba(0,0,0,.55);
  animation: hud-flash-in 1.3s ease both;
  pointer-events: none;
}
@keyframes hud-flash-in {
  0% { transform: scale(.6); opacity: 0; }
  18% { transform: scale(1.08); opacity: 1; }
  30% { transform: scale(1); }
  75% { opacity: 1; }
  100% { transform: scale(1.02); opacity: 0; }
}

.hud-menu-primary {
  padding: .9rem 3rem;
  border-radius: 9999px;
  font-size: 1.15rem; font-weight: 800; letter-spacing: .15em;
  color: #081c26;
  background: linear-gradient(180deg, #f7cd8a 0%, #f2b25c 60%, #dd9a44 100%);
  box-shadow: 0 0 22px rgba(242,178,92,.4), 0 4px 0 rgba(120,74,26,.9);
  transition: transform .12s ease;
}
.hud-menu-primary:active { transform: translateY(2px) scale(.97); }
.hud-menu-danger {
  padding: .7rem 2.2rem;
  border-radius: 9999px;
  font-size: 1rem; font-weight: 700; letter-spacing: .1em;
  color: #e8a49a;
  background: rgba(8,28,38,.7);
  border: 1px solid rgba(232,132,95,.4);
  transition: transform .12s ease, background .12s ease;
}
.hud-menu-danger:active { transform: scale(.95); background: rgba(15,52,67,.9); }
`;
