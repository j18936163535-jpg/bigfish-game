// =============================================================
// 大鱼吃小鱼 · 商店弹窗（plan.md §5 商品表）
// 卡片网格：icon/名称/效果/等级圆点/价格；满级 MAX，金币不足置灰；
// 购买成功扣款 + audio.play('coin') + 卡片弹跳反馈。
// =============================================================
import { useState } from 'react';
import { audio } from '../game/audio';
import { shopItems } from '../game/data/items';
import type { SaveData } from '../game/types';
import { priceOf, tryBuyItem } from '../store/economy';

export interface ShopModalProps {
  save: SaveData;
  /** 购买成功后回传新存档（已持久化），父级 setState。 */
  onChange(next: SaveData): void;
  onClose(): void;
}

export default function ShopModal({ save, onChange, onClose }: ShopModalProps) {
  /** 最近一次成功购买，用于卡片弹跳动画重放。 */
  const [bought, setBought] = useState<{ id: string; level: number } | null>(
    null,
  );
  /** 最近一笔失败购买（金币不足），用于摇头反馈。 */
  const [denied, setDenied] = useState<string | null>(null);

  const handleBuy = (itemId: string) => {
    const item = shopItems.find((i) => i.id === itemId);
    if (!item) return;
    const { save: next, ok } = tryBuyItem(save, item);
    if (ok) {
      audio.play('coin');
      setBought({ id: item.id, level: next.items[item.id] ?? 0 });
      onChange(next);
    } else {
      audio.play('ui');
      setDenied(item.id);
      window.setTimeout(() => setDenied((d) => (d === item.id ? null : d)), 450);
    }
  };

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
      <div className="shop-panel safe-bottom relative flex max-h-[86dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-[#9db8bf]/15 bg-[#0c2836]/95 shadow-2xl backdrop-blur-md sm:rounded-3xl">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 pb-3 pt-4">
          <h2 className="text-lg font-bold tracking-widest text-[#f5e7c8]">
            🏪 深海商店
          </h2>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-black/30 px-3 py-1 text-sm font-semibold text-[#f2b25c]">
              🪙 {save.coins}
            </span>
            <button
              type="button"
              className="shop-close"
              onClick={() => {
                audio.play('ui');
                onClose();
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* 商品网格 */}
        <div className="grid flex-1 grid-cols-2 gap-3 overflow-y-auto px-5 pb-6">
          {shopItems.map((item) => {
            const owned = save.items[item.id] ?? 0;
            const price = priceOf(item, owned);
            const maxed = owned >= item.maxLevel;
            const affordable = !maxed && save.coins >= price;
            const isBought = bought?.id === item.id && bought.level === owned;
            const isDenied = denied === item.id;
            return (
              <button
                key={item.id}
                type="button"
                disabled={maxed}
                onClick={() => handleBuy(item.id)}
                className={`shop-card ${isBought ? 'shop-card-bounce' : ''} ${
                  isDenied ? 'shop-card-denied' : ''
                } ${maxed ? 'shop-card-maxed' : affordable ? '' : 'shop-card-poor'}`}
              >
                <div className="text-3xl" aria-hidden>
                  {item.icon}
                </div>
                <div className="mt-1 text-sm font-bold text-[#e8f1f2]">
                  {item.name}
                </div>
                <div className="mt-0.5 min-h-8 px-1 text-[10px] leading-tight text-[#9db8bf]">
                  {item.desc}
                </div>
                {/* 等级圆点 */}
                <div className="mt-1.5 flex items-center justify-center gap-1">
                  {Array.from({ length: item.maxLevel }, (_, i) => (
                    <span
                      key={i}
                      className={`h-1.5 w-1.5 rounded-full ${
                        i < owned ? 'bg-[#f2b25c]' : 'bg-white/15'
                      }`}
                    />
                  ))}
                </div>
                {/* 价格 / MAX */}
                <div
                  className={`mt-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                    maxed
                      ? 'bg-white/10 text-[#9db8bf]'
                      : affordable
                        ? 'bg-[#f2b25c]/15 text-[#f2b25c]'
                        : 'bg-white/5 text-[#7d98a0]'
                  }`}
                >
                  {maxed ? 'MAX' : `🪙 ${price}`}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const CSS = `
.shop-panel { animation: shop-panel-in .28s cubic-bezier(.2,1.1,.4,1) both; }
@keyframes shop-panel-in {
  from { transform: translateY(40px); opacity: 0; }
  to   { transform: none; opacity: 1; }
}
.shop-close {
  display: flex; align-items: center; justify-content: center;
  width: 2rem; height: 2rem; border-radius: 9999px;
  background: rgba(255,255,255,.08); color: #9db8bf;
  transition: background .15s ease, transform .15s ease;
}
.shop-close:active { transform: scale(.9); background: rgba(255,255,255,.16); }

.shop-card {
  display: flex; flex-direction: column; align-items: center;
  padding: .9rem .5rem .8rem;
  border-radius: 1rem;
  background: rgba(8,28,38,.6);
  border: 1px solid rgba(157,184,191,.16);
  transition: transform .15s ease, border-color .15s ease, opacity .15s ease;
}
.shop-card:active { transform: scale(.96); border-color: rgba(242,178,92,.5); }
.shop-card-poor { opacity: .55; }
.shop-card-maxed { opacity: .7; border-color: rgba(242,178,92,.25); }
.shop-card-bounce { animation: shop-bounce .45s cubic-bezier(.2,1.8,.4,1); }
@keyframes shop-bounce {
  0% { transform: scale(1); }
  40% { transform: scale(1.08); }
  100% { transform: scale(1); }
}
.shop-card-denied { animation: shop-denied .4s ease; }
@keyframes shop-denied {
  0%,100% { transform: translateX(0); }
  25% { transform: translateX(-5px); }
  50% { transform: translateX(5px); }
  75% { transform: translateX(-3px); }
}
`;
