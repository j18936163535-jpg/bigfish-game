// =============================================================
// 大鱼吃小鱼 · 鱼图鉴弹窗
// 已发现：图片 + 名称 + 简介（FishSpec.desc，QA 补充的契约扩展）；
// 未发现：剪影 + ???。desc 缺失时回退 tier/behavior 本地生成。
// =============================================================
import { useState } from 'react';
import { audio } from '../game/audio';
import { fish } from '../game/data/fish';
import type { Behavior } from '../game/types';

export interface AlbumModalProps {
  /** save.discovered 透传。 */
  discovered: string[];
  onClose(): void;
}

const BEHAVIOR_TEXT: Record<Behavior, string> = {
  wander: '悠然四处游荡',
  flee: '一受惊就逃之夭夭',
  chase: '凶猛的追击者',
  dart: '间歇性爆发突进',
  lazy: '慢吞吞地随波逐流',
};

export default function AlbumModal({ discovered, onClose }: AlbumModalProps) {
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set());
  const markBroken = (id: string) =>
    setBroken((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));

  const foundCount = fish.filter((f) => discovered.includes(f.id)).length;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
      <style>{CSS}</style>
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={() => {
          audio.play('ui');
          onClose();
        }}
      />
      <div className="album-panel safe-bottom relative flex max-h-[86dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-[#9db8bf]/15 bg-[#0c2836]/95 shadow-2xl backdrop-blur-md sm:rounded-3xl">
        <div className="flex items-center justify-between px-5 pb-3 pt-4">
          <h2 className="text-lg font-bold tracking-widest text-[#f5e7c8]">
            📖 深海图鉴
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[#9db8bf]">
              已发现 {foundCount}/{fish.length}
            </span>
            <button
              type="button"
              className="album-close"
              onClick={() => {
                audio.play('ui');
                onClose();
              }}
            >
              ✕
            </button>
          </div>
        </div>

        <div className="grid flex-1 grid-cols-3 gap-2.5 overflow-y-auto px-5 pb-6">
          {fish.map((f) => {
            const found = discovered.includes(f.id);
            const imgBroken = broken.has(f.id);
            return (
              <div
                key={f.id}
                className={`album-cell ${
                  found ? '' : 'album-cell-unknown'
                } ${f.special === 'rainbow' ? 'album-cell-rainbow' : ''}`}
              >
                <div className="flex h-12 items-center justify-center">
                  {imgBroken ? (
                    <span className="text-xl text-[#7d98a0]">◈</span>
                  ) : (
                    <img
                      src={f.sprite}
                      alt={found ? f.name : '???'}
                      draggable={false}
                      className={`max-h-12 object-contain ${
                        found
                          ? 'drop-shadow-[0_2px_5px_rgba(0,0,0,.5)]'
                          : 'album-silhouette'
                      }`}
                      onError={() => markBroken(f.id)}
                    />
                  )}
                </div>
                <div
                  className={`mt-1 text-xs font-semibold ${
                    found ? 'text-[#e8f1f2]' : 'text-[#7d98a0]'
                  }`}
                >
                  {found ? f.name : '???'}
                </div>
                <div className="mt-0.5 min-h-7 px-1 text-[9px] leading-tight text-[#7d98a0]">
                  {found
                    ? `${f.desc ?? `第${f.tier}档 · ${BEHAVIOR_TEXT[f.behavior]}`}${
                        f.special === 'rainbow' ? ' 吃掉触发狂暴！' : ''
                      }`
                    : '尚未在深海中遇见'}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const CSS = `
.album-panel { animation: album-panel-in .28s cubic-bezier(.2,1.1,.4,1) both; }
@keyframes album-panel-in {
  from { transform: translateY(40px); opacity: 0; }
  to { transform: none; opacity: 1; }
}
.album-close {
  display: flex; align-items: center; justify-content: center;
  width: 2rem; height: 2rem; border-radius: 9999px;
  background: rgba(255,255,255,.08); color: #9db8bf;
  transition: background .15s ease, transform .15s ease;
}
.album-close:active { transform: scale(.9); background: rgba(255,255,255,.16); }

.album-cell {
  display: flex; flex-direction: column; align-items: center;
  padding: .6rem .3rem .55rem;
  border-radius: .9rem;
  background: rgba(8,28,38,.6);
  border: 1px solid rgba(157,184,191,.14);
  text-align: center;
}
.album-cell-unknown { opacity: .8; }
.album-cell-rainbow { border-color: rgba(242,178,92,.45); }
.album-silhouette {
  filter: brightness(0) opacity(.55);
}
`;
