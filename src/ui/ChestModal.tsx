// =============================================================
// 大鱼吃小鱼 · 宝箱开启动画（plan.md §5：5 档稀有度）
// 流程：点击宝箱 → 摇晃 → 爆开 + 光环放射 → 金币/经验数值滚动 → 收下奖励。
// 图片缺失时回退 📦 emoji + 稀有度配色光晕。
// =============================================================
import { useEffect, useRef, useState } from 'react';
import { audio } from '../game/audio';
import type { ChestRarity, ChestReward } from '../game/types';

export interface ChestModalProps {
  chest: ChestReward;
  /** 玩家点「收下奖励」后回调（宝箱奖励在 settleRun 时已入账）。 */
  onDone(): void;
}

const RARITY_STYLE: Record<
  ChestRarity,
  { name: string; ring: string; glow: string; beam: string }
> = {
  wood: {
    name: '木质宝箱',
    ring: '#8a6a4f',
    glow: 'rgba(138,106,79,.45)',
    beam: 'rgba(196,156,110,.5)',
  },
  silver: {
    name: '白银宝箱',
    ring: '#b9c4c9',
    glow: 'rgba(185,196,201,.45)',
    beam: 'rgba(214,226,230,.55)',
  },
  gold: {
    name: '黄金宝箱',
    ring: '#f2b25c',
    glow: 'rgba(242,178,92,.55)',
    beam: 'rgba(247,205,138,.6)',
  },
  platinum: {
    name: '铂金宝箱',
    ring: '#cfe8e4',
    glow: 'rgba(207,232,228,.5)',
    beam: 'rgba(224,244,240,.55)',
  },
  diamond: {
    name: '钻石宝箱',
    ring: '#8fa8c8',
    glow: 'rgba(143,168,200,.5)',
    beam: 'rgba(168,190,220,.55)',
  },
};

type Phase = 'idle' | 'shaking' | 'opened';

export default function ChestModal({ chest, onDone }: ChestModalProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [imgOk, setImgOk] = useState(true);
  const [shown, setShown] = useState({ coins: 0, xp: 0 });
  const timers = useRef<number[]>([]);
  const style = RARITY_STYLE[chest.rarity];

  // 卸载清理所有定时器（StrictMode 安全）
  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
    },
    [],
  );

  // 爆开后数值滚动动画（0 → 目标值，900ms 缓出）
  useEffect(() => {
    if (phase !== 'opened') return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / 900);
      const e = 1 - Math.pow(1 - p, 3);
      setShown({
        coins: Math.round(chest.coins * e),
        xp: Math.round(chest.bonusXp * e),
      });
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, chest.coins, chest.bonusXp]);

  const handleOpen = () => {
    if (phase !== 'idle') return;
    audio.play('chest');
    setPhase('shaking');
    timers.current.push(
      window.setTimeout(() => {
        audio.play('chestOpen');
        setPhase('opened');
      }, 750),
    );
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <style>{CSS}</style>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-[3px]" />

      <div className="relative flex w-full max-w-xs flex-col items-center px-6">
        {/* 爆开时的光环放射 */}
        {phase === 'opened' && (
          <>
            <span
              className="chest-halo"
              style={{ background: `radial-gradient(circle, ${style.beam} 0%, transparent 65%)` }}
            />
            <span
              className="chest-halo chest-halo-late"
              style={{ background: `radial-gradient(circle, ${style.glow} 0%, transparent 60%)` }}
            />
          </>
        )}

        <div className="mb-2 text-sm tracking-[0.4em] text-[#9db8bf]">
          {style.name}
        </div>

        {/* 宝箱本体 */}
        <button
          type="button"
          onClick={handleOpen}
          disabled={phase !== 'idle'}
          className={`chest-box ${phase === 'shaking' ? 'chest-shake' : ''} ${
            phase === 'opened' ? 'chest-opened' : ''
          }`}
          style={{
            borderColor: style.ring,
            boxShadow: `0 0 32px ${style.glow}, inset 0 0 24px rgba(0,0,0,.35)`,
          }}
        >
          {imgOk ? (
            <img
              src={`assets/ui/chest_${chest.rarity}.png`}
              alt={style.name}
              draggable={false}
              className="h-28 w-28 object-contain"
              onError={() => setImgOk(false)}
            />
          ) : (
            <span className="text-7xl" aria-hidden>
              📦
            </span>
          )}
        </button>

        {phase === 'idle' && (
          <div className="mt-4 animate-pulse text-sm text-[#e8f1f2]">
            点击开启宝箱
          </div>
        )}

        {/* 奖励展示 */}
        {phase === 'opened' && (
          <div className="chest-reward mt-5 flex w-full flex-col items-center gap-3">
            <div className="flex w-full justify-center gap-4">
              <div className="chest-reward-item">
                <span className="text-2xl" aria-hidden>
                  🪙
                </span>
                <span className="text-2xl font-extrabold text-[#f2b25c]">
                  +{shown.coins}
                </span>
                <span className="text-xs text-[#9db8bf]">金币</span>
              </div>
              <div className="chest-reward-item">
                <span className="text-2xl" aria-hidden>
                  ✨
                </span>
                <span className="text-2xl font-extrabold text-[#cfe8e4]">
                  +{shown.xp}
                </span>
                <span className="text-xs text-[#9db8bf]">经验</span>
              </div>
            </div>
            <button
              type="button"
              className="chest-claim"
              onClick={() => {
                audio.play('coin');
                onDone();
              }}
            >
              收下奖励
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const CSS = `
.chest-box {
  display: flex; align-items: center; justify-content: center;
  width: 11rem; height: 11rem;
  border-radius: 1.5rem;
  background: linear-gradient(180deg, #0f3443 0%, #081c26 100%);
  border: 2px solid;
  transition: transform .15s ease;
}
.chest-box:active { transform: scale(.95); }
.chest-shake { animation: chest-shake .75s ease-in-out both; }
@keyframes chest-shake {
  0%,100% { transform: rotate(0) scale(1); }
  15% { transform: rotate(-6deg) scale(1.02); }
  30% { transform: rotate(6deg) scale(1.05); }
  45% { transform: rotate(-7deg) scale(1.07); }
  60% { transform: rotate(7deg) scale(1.09); }
  80% { transform: rotate(-4deg) scale(1.12); }
}
.chest-opened { animation: chest-pop .5s cubic-bezier(.2,1.6,.4,1) both; }
@keyframes chest-pop {
  0% { transform: scale(1.1); filter: brightness(2); }
  100% { transform: scale(1); filter: brightness(1.15); }
}
.chest-halo {
  position: absolute; top: 30%; left: 50%;
  width: 22rem; height: 22rem;
  transform: translate(-50%,-50%);
  border-radius: 9999px;
  animation: chest-halo 1.4s ease-out both;
  pointer-events: none;
}
.chest-halo-late { animation-delay: .18s; }
@keyframes chest-halo {
  0% { transform: translate(-50%,-50%) scale(.15); opacity: .95; }
  100% { transform: translate(-50%,-50%) scale(1.6); opacity: 0; }
}
.chest-reward { animation: chest-reward-in .45s ease .1s both; }
@keyframes chest-reward-in {
  from { transform: translateY(16px); opacity: 0; }
  to { transform: none; opacity: 1; }
}
.chest-reward-item {
  display: flex; flex-direction: column; align-items: center; gap: .15rem;
  min-width: 6rem; padding: .8rem 1rem;
  border-radius: 1rem;
  background: rgba(8,28,38,.7);
  border: 1px solid rgba(157,184,191,.2);
}
.chest-claim {
  margin-top: .4rem;
  padding: .8rem 2.8rem;
  border-radius: 9999px;
  font-size: 1.05rem; font-weight: 800; letter-spacing: .15em;
  color: #081c26;
  background: linear-gradient(180deg, #f7cd8a 0%, #f2b25c 60%, #dd9a44 100%);
  box-shadow: 0 0 22px rgba(242,178,92,.4), 0 4px 0 rgba(120,74,26,.9);
  transition: transform .12s ease;
}
.chest-claim:active { transform: translateY(2px) scale(.97); }
`;
