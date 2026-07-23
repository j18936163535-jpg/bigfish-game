// =============================================================
// 大鱼吃小鱼 · 主页（plan.md §0：深海背景 + 发光开始按钮 +
// 商店解锁动画 + 图鉴 + 静音 + 初始鱼选择轮播）
// 视觉：低饱和深海（#0f3443→#081c26）+ 琥珀暖光，CSS keyframes 动效。
// =============================================================
import { useEffect, useRef, useState } from 'react';
import { audio } from '../game/audio';
import { playerFish } from '../game/data/playerFish';
import type { SaveData } from '../game/types';
import { xpNeed } from '../store/economy';

export interface HomeScreenProps {
  save: SaveData;
  /** 本次返回主页是否需要播放商店解锁动画（settleRun.justUnlockedShop 透传）。 */
  justUnlockedShop?: boolean;
  /** 解锁动画播完后回调，集成者清除 justUnlockedShop 标记。 */
  onShopUnlockShown?: () => void;
  onStart(): void;
  onOpenShop(): void;
  onOpenAlbum(): void;
  onSelectFish(fishId: string): void;
  onToggleMuted(): void;
}

const fishImg = (sprite: string): string =>
  sprite.includes('/') ? sprite : `assets/fish/${sprite}.png`;

export default function HomeScreen(props: HomeScreenProps) {
  const {
    save,
    justUnlockedShop = false,
    onShopUnlockShown,
    onStart,
    onOpenShop,
    onOpenAlbum,
    onSelectFish,
    onToggleMuted,
  } = props;

  const [bgOk, setBgOk] = useState(true);
  const [brokenFish, setBrokenFish] = useState<ReadonlySet<string>>(new Set());
  const unlockSfxPlayed = useRef(false);

  const need = xpNeed(save.level);
  const xpPct = Math.min(100, (save.xp / need) * 100);

  // 首次用户手势解锁 WebAudio（iOS 限制；once 监听，双跑安全）
  useEffect(() => {
    const onGesture = () => audio.unlock();
    window.addEventListener('pointerdown', onGesture, { once: true });
    return () => window.removeEventListener('pointerdown', onGesture);
  }, []);

  // 商店解锁：音效只放一次（ref 防 StrictMode 双跑），动画播完通知父级
  useEffect(() => {
    if (!justUnlockedShop) return;
    if (!unlockSfxPlayed.current) {
      unlockSfxPlayed.current = true;
      audio.play('unlock');
    }
    const t = window.setTimeout(() => onShopUnlockShown?.(), 1700);
    return () => window.clearTimeout(t);
  }, [justUnlockedShop, onShopUnlockShown]);

  const markBroken = (id: string) =>
    setBrokenFish((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));

  return (
    <div className="fixed inset-0 overflow-hidden">
      <style>{CSS}</style>

      {/* 背景：PNG 优先，加载失败回退 CSS 深海渐变（渐变始终垫底） */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 80% at 50% 0%, #134a5e 0%, #0f3443 45%, #081c26 100%)',
        }}
      />
      {bgOk && (
        <img
          src="assets/ui/bg-home.png"
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setBgOk(false)}
        />
      )}
      {/* 压暗 vignette，保证文字可读 */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(90% 70% at 50% 42%, rgba(8,28,38,0) 55%, rgba(8,28,38,.55) 100%)',
        }}
      />

      <div className="safe-area relative flex h-full flex-col items-center px-5 pb-6 pt-4">
        {/* 顶栏：等级 / 经验条 / 金币 / 图鉴 / 静音 */}
        <div className="flex w-full max-w-md items-center gap-2">
          <div className="flex items-center gap-2 rounded-full bg-black/30 py-1 pl-1 pr-3 backdrop-blur-sm">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#f2b25c] text-xs font-bold text-[#081c26]">
              {save.level}
            </span>
            <div className="w-24">
              <div className="mb-0.5 flex justify-between text-[10px] leading-none text-[#9db8bf]">
                <span>Lv.{save.level}</span>
                <span>
                  {save.xp}/{need}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#e8845f] to-[#f2b25c] transition-[width] duration-700"
                  style={{ width: `${xpPct}%` }}
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-full bg-black/30 px-3 py-1.5 text-sm font-semibold text-[#f2b25c] backdrop-blur-sm">
            <span aria-hidden>🪙</span>
            {save.coins}
          </div>
          <div className="flex-1" />
          <button
            type="button"
            className="home-iconbtn"
            title="图鉴"
            onClick={() => {
              audio.play('ui');
              onOpenAlbum();
            }}
          >
            📖
          </button>
          <button
            type="button"
            className="home-iconbtn"
            title={save.muted ? '取消静音' : '静音'}
            onClick={() => {
              audio.setMuted(!save.muted);
              audio.play('ui');
              onToggleMuted();
            }}
          >
            {save.muted ? '🔇' : '🔊'}
          </button>
        </div>

        {/* 标题 */}
        <div className="mt-8 text-center">
          <h1 className="home-title">大鱼吃小鱼</h1>
          <p className="mt-1 text-xs tracking-[0.5em] text-[#9db8bf]">
            深 海 肉 鸽 大 冒 险
          </p>
        </div>

        {/* 中央：开始 + 商店 */}
        <div className="flex flex-1 flex-col items-center justify-center gap-5">
          <button
            type="button"
            className="home-startbtn"
            onClick={() => {
              audio.play('ui');
              onStart();
            }}
          >
            开始游戏
          </button>

          {save.shopUnlocked ? (
            <div className="relative">
              {justUnlockedShop && <span className="home-goldburst" aria-hidden />}
              <button
                type="button"
                className={`home-shopbtn ${justUnlockedShop ? 'home-shopbtn-unlock' : ''}`}
                onClick={() => {
                  audio.play('ui');
                  onOpenShop();
                }}
              >
                🏪 商店
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled
              className="home-shopbtn home-shopbtn-locked"
              title="完成 1 局后解锁"
            >
              🔒 商店 · 完成 1 局解锁
            </button>
          )}
        </div>

        {/* 初始鱼选择轮播 */}
        <div className="w-full max-w-md">
          <div className="mb-2 text-center text-xs text-[#9db8bf]">
            选择你的初始鱼
          </div>
          <div className="home-carousel">
            {playerFish.map((f) => {
              const unlocked = save.unlockedFish.includes(f.id);
              const selected = save.selectedFish === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  disabled={!unlocked}
                  onClick={() => {
                    audio.play('ui');
                    onSelectFish(f.id);
                  }}
                  className={`home-fishcard ${
                    selected ? 'home-fishcard-selected' : ''
                  } ${unlocked ? '' : 'home-fishcard-locked'}`}
                >
                  <div className="relative flex h-14 items-center justify-center">
                    {brokenFish.has(f.id) ? (
                      <span className="text-2xl text-[#9db8bf]">◈</span>
                    ) : (
                      <img
                        src={fishImg(f.sprite)}
                        alt={f.name}
                        draggable={false}
                        className={`max-h-14 object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,.5)] ${
                          unlocked ? '' : 'opacity-50 grayscale'
                        }`}
                        onError={() => markBroken(f.id)}
                      />
                    )}
                    {!unlocked && (
                      <span className="absolute inset-0 flex items-center justify-center text-xl">
                        🔒
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-[#e8f1f2]">
                    {f.name}
                  </div>
                  <div className="text-[10px] text-[#9db8bf]">{f.title}</div>
                  <div className="mt-1 flex items-center justify-center gap-1 text-[10px] text-[#9db8bf]">
                    <span aria-hidden>{f.skill.icon}</span>
                    <span>{f.skill.name}</span>
                  </div>
                  {f.passiveDesc && (
                    <div className="mt-0.5 line-clamp-2 px-1 text-[10px] leading-tight text-[#7d98a0]">
                      {f.passiveDesc}
                    </div>
                  )}
                  {!unlocked && (
                    <div className="mt-1 text-[10px] text-[#e8845f]">
                      Lv.{f.unlockLevel} 解锁
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.home-title {
  margin: 0;
  font-size: 3rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: #f5e7c8;
  text-shadow:
    0 0 18px rgba(242,178,92,.35),
    0 0 48px rgba(242,178,92,.18),
    0 3px 0 rgba(0,0,0,.45);
  animation: home-title-glow 3.2s ease-in-out infinite;
}
@keyframes home-title-glow {
  0%,100% { text-shadow: 0 0 18px rgba(242,178,92,.35), 0 0 48px rgba(242,178,92,.18), 0 3px 0 rgba(0,0,0,.45); }
  50%     { text-shadow: 0 0 30px rgba(242,178,92,.6), 0 0 70px rgba(242,178,92,.3), 0 3px 0 rgba(0,0,0,.45); }
}

.home-iconbtn {
  display: flex; align-items: center; justify-content: center;
  width: 2.25rem; height: 2.25rem; border-radius: 9999px;
  background: rgba(0,0,0,.3); backdrop-filter: blur(4px);
  font-size: 1rem; transition: transform .15s ease, background .15s ease;
}
.home-iconbtn:active { transform: scale(.9); background: rgba(0,0,0,.5); }

.home-startbtn {
  padding: 1.1rem 3.6rem;
  border-radius: 9999px;
  font-size: 1.5rem; font-weight: 800; letter-spacing: .2em;
  color: #081c26;
  background: linear-gradient(180deg, #f7cd8a 0%, #f2b25c 55%, #dd9a44 100%);
  box-shadow: 0 0 26px rgba(242,178,92,.35), 0 0 70px rgba(242,178,92,.15), 0 6px 0 rgba(120,74,26,.9);
  animation: home-breathe 2.4s ease-in-out infinite;
  transition: transform .12s ease;
}
.home-startbtn:active { transform: translateY(3px) scale(.97); }
@keyframes home-breathe {
  0%,100% { box-shadow: 0 0 26px rgba(242,178,92,.35), 0 0 70px rgba(242,178,92,.15), 0 6px 0 rgba(120,74,26,.9); }
  50%     { box-shadow: 0 0 44px rgba(242,178,92,.65), 0 0 100px rgba(242,178,92,.3), 0 6px 0 rgba(120,74,26,.9); }
}

.home-shopbtn {
  padding: .6rem 1.8rem;
  border-radius: 9999px;
  font-size: 1rem; font-weight: 700; letter-spacing: .1em;
  color: #f5e7c8;
  background: rgba(15,52,67,.85);
  border: 1px solid rgba(242,178,92,.45);
  box-shadow: 0 0 14px rgba(242,178,92,.18);
  transition: transform .15s ease, box-shadow .15s ease;
}
.home-shopbtn:active { transform: scale(.95); }
.home-shopbtn-locked {
  color: #7d98a0; border-color: rgba(125,152,160,.3);
  background: rgba(8,28,38,.6); box-shadow: none;
  font-weight: 500;
}
.home-shopbtn-unlock { animation: home-shop-rise 1.5s cubic-bezier(.2,1.4,.4,1) both; }
@keyframes home-shop-rise {
  0%   { transform: translateY(70px) scale(.4); opacity: 0; }
  45%  { transform: translateY(-10px) scale(1.1); opacity: 1; }
  60%  { transform: translateY(0) scale(1); }
  70%  { transform: translateX(-5px) rotate(-2.5deg); }
  80%  { transform: translateX(5px) rotate(2.5deg); }
  90%  { transform: translateX(-2px) rotate(-1deg); }
  100% { transform: none; }
}
.home-goldburst {
  position: absolute; inset: -18px; border-radius: 9999px;
  background: radial-gradient(circle, rgba(242,178,92,.85) 0%, rgba(242,178,92,.35) 45%, rgba(242,178,92,0) 70%);
  animation: home-goldburst 1.1s ease-out .25s both;
  pointer-events: none;
}
@keyframes home-goldburst {
  0%   { transform: scale(.2); opacity: .95; }
  100% { transform: scale(2.4); opacity: 0; }
}

.home-carousel {
  display: flex; gap: .75rem;
  overflow-x: auto; padding: .25rem .5rem .5rem;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.home-carousel::-webkit-scrollbar { display: none; }

.home-fishcard {
  flex: 0 0 auto; width: 7rem;
  scroll-snap-align: center;
  padding: .6rem .4rem .7rem;
  border-radius: 1rem;
  background: rgba(8,28,38,.55);
  border: 1px solid rgba(157,184,191,.18);
  backdrop-filter: blur(4px);
  text-align: center;
  transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease;
}
.home-fishcard:active { transform: scale(.94); }
.home-fishcard-selected {
  border-color: #f2b25c;
  box-shadow: 0 0 16px rgba(242,178,92,.35), inset 0 0 12px rgba(242,178,92,.08);
  transform: translateY(-3px);
}
.home-fishcard-locked { opacity: .75; }
`;
