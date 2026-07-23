// =============================================================
// 大鱼吃小鱼 · 结算屏（plan.md §0/§5）
// 展示本局分数/金币/时长/最大档位/吃鱼数；经验条增长动画；
// 升级与新解锁鱼即时提示；「领取宝箱」→ ChestModal → 回主页。
// =============================================================
import { useEffect, useRef, useState } from 'react';
import { audio } from '../game/audio';
import type { RunResult } from '../game/types';
import { xpNeed } from '../store/economy';
import type { SettleResult } from '../store/economy';

export interface ResultScreenProps {
  /** 本局原始结果。 */
  result: RunResult;
  /** settleRun 的返回（含结算后存档/经验/宝箱/新解锁鱼）。 */
  settle: SettleResult;
  /** 结算前等级与经验（用于经验条增长动画起点）。 */
  prevLevel: number;
  prevXp: number;
  /** 点击「领取宝箱」，父级打开 ChestModal。 */
  onClaimChest(): void;
}

const RARITY_NAME: Record<string, string> = {
  wood: '木质宝箱',
  silver: '白银宝箱',
  gold: '黄金宝箱',
  platinum: '铂金宝箱',
  diamond: '钻石宝箱',
};

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function ResultScreen({
  result,
  settle,
  prevLevel,
  prevXp,
  onClaimChest,
}: ResultScreenProps) {
  const finalPct = Math.min(
    100,
    (settle.save.xp / xpNeed(settle.save.level)) * 100,
  );
  const startPct = Math.min(100, (prevXp / xpNeed(prevLevel)) * 100);
  const [pct, setPct] = useState(startPct);
  const levelSfxPlayed = useRef(false);

  // 经验条入场后增长（StrictMode 双跑安全：定时器可重复）
  useEffect(() => {
    const t = window.setTimeout(() => setPct(finalPct), 250);
    return () => window.clearTimeout(t);
  }, [finalPct]);

  // 升级音效只放一次
  useEffect(() => {
    if (settle.levelUps > 0 && !levelSfxPlayed.current) {
      levelSfxPlayed.current = true;
      audio.play('levelup');
    }
  }, [settle.levelUps]);

  const isBest = result.score > 0 && result.score >= settle.save.bestScore;

  return (
    <div
      className="fixed inset-0 overflow-y-auto"
      style={{
        background:
          'radial-gradient(120% 80% at 50% 0%, #134a5e 0%, #0f3443 45%, #081c26 100%)',
      }}
    >
      <style>{CSS}</style>
      <div className="safe-area mx-auto flex min-h-full w-full max-w-md flex-col items-center px-6 py-8">
        <div className="result-pop text-sm tracking-[0.5em] text-[#9db8bf]">
          本局结束
        </div>
        <div className="result-pop mt-1 text-4xl font-extrabold text-[#f5e7c8] [animation-delay:.08s]">
          {result.score}
          <span className="ml-2 text-base font-medium text-[#9db8bf]">分</span>
        </div>
        {isBest && (
          <div className="result-pop mt-2 rounded-full bg-[#f2b25c]/15 px-3 py-1 text-xs font-bold text-[#f2b25c] [animation-delay:.16s]">
            🏆 新纪录！
          </div>
        )}
        {result.cause === 'quit' && (
          <div className="result-pop mt-2 text-xs text-[#7d98a0] [animation-delay:.16s]">
            （主动结束本局）
          </div>
        )}

        {/* 数据网格 */}
        <div className="result-pop mt-6 grid w-full grid-cols-2 gap-3 [animation-delay:.24s]">
          <Stat label="金币" value={`+${result.coins}`} icon="🪙" />
          <Stat label="时长" value={fmtDuration(result.duration)} icon="⏱️" />
          <Stat label="最大档位" value={`T${result.maxTier}`} icon="🌊" />
          <Stat label="吃鱼数" value={`${result.kills}`} icon="🍽️" />
        </div>

        {/* 经验条 */}
        <div className="result-pop mt-6 w-full [animation-delay:.32s]">
          <div className="mb-1 flex items-end justify-between text-xs text-[#9db8bf]">
            <span>
              Lv.{settle.save.level}
              {settle.levelUps > 0 && (
                <span className="ml-2 rounded-full bg-[#e8845f]/20 px-2 py-0.5 font-bold text-[#e8845f]">
                  等级 +{settle.levelUps}！
                </span>
              )}
            </span>
            <span>
              经验 +{settle.xpGained}
              {settle.chest.bonusXp > 0 && `（宝箱 +${settle.chest.bonusXp}）`}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#e8845f] to-[#f2b25c] transition-[width] duration-1000 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* 新解锁鱼 */}
        {settle.newFish.length > 0 && (
          <div className="result-pop mt-5 w-full rounded-2xl border border-[#f2b25c]/40 bg-[#f2b25c]/10 px-4 py-3 [animation-delay:.4s]">
            <div className="text-center text-sm font-bold text-[#f2b25c]">
              🎉 解锁新初始鱼！
            </div>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {settle.newFish.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center gap-1.5 rounded-full bg-black/25 px-3 py-1.5 text-sm text-[#e8f1f2]"
                >
                  <span aria-hidden>{f.skill.icon}</span>
                  {f.name}
                  <span className="text-[10px] text-[#9db8bf]">{f.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 领取宝箱 */}
        <button
          type="button"
          className="result-pop result-claim mt-8 [animation-delay:.48s]"
          onClick={() => {
            audio.play('ui');
            onClaimChest();
          }}
        >
          🎁 领取宝箱（{RARITY_NAME[settle.chest.rarity] ?? '宝箱'}）
        </button>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[#9db8bf]/15 bg-black/25 px-4 py-3 backdrop-blur-sm">
      <span className="text-2xl" aria-hidden>
        {icon}
      </span>
      <div>
        <div className="text-[10px] text-[#9db8bf]">{label}</div>
        <div className="text-lg font-bold text-[#e8f1f2]">{value}</div>
      </div>
    </div>
  );
}

const CSS = `
.result-pop { animation: result-pop .45s cubic-bezier(.2,1.2,.4,1) both; }
@keyframes result-pop {
  from { transform: translateY(18px); opacity: 0; }
  to { transform: none; opacity: 1; }
}
.result-claim {
  padding: .95rem 2.6rem;
  border-radius: 9999px;
  font-size: 1.1rem; font-weight: 800; letter-spacing: .1em;
  color: #081c26;
  background: linear-gradient(180deg, #f7cd8a 0%, #f2b25c 60%, #dd9a44 100%);
  box-shadow: 0 0 26px rgba(242,178,92,.4), 0 5px 0 rgba(120,74,26,.9);
  animation: result-pop .45s cubic-bezier(.2,1.2,.4,1) both, result-claim-breathe 2.2s ease-in-out 1s infinite;
  transition: transform .12s ease;
}
.result-claim:active { transform: translateY(3px) scale(.97); }
@keyframes result-claim-breathe {
  0%,100% { box-shadow: 0 0 26px rgba(242,178,92,.4), 0 5px 0 rgba(120,74,26,.9); }
  50% { box-shadow: 0 0 44px rgba(242,178,92,.65), 0 5px 0 rgba(120,74,26,.9); }
}
`;
