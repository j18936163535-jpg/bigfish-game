// =============================================================
// 大鱼吃小鱼 · App 根组件（阶段3 集成）
// 屏幕路由状态机：Home ⇄ Game → Result → ChestModal → Home
// - 存档为单一状态源（loadSave 懒初始化），组件全部受控；
// - 静音以 audio 模块的 localStorage('bigfish.muted') 为准，
//   启动时把 SaveData.muted 对齐到 audio，切换时反向同步存档；
// - settleRun 由 GameScreen 代做（已入账+持久化），这里只接收结果；
// - justUnlockedShop 透传 HomeScreen 播一次解锁动画后清除。
// =============================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RunResult, SaveData } from './game/types';
import { loadSave, persistSave } from './store/save';
import {
  addDiscovered,
  selectFish,
  setMutedFlag,
  type SettleResult,
} from './store/economy';
import HomeScreen from './ui/HomeScreen';
import GameScreen from './ui/GameScreen';
import ResultScreen from './ui/ResultScreen';
import ShopModal from './ui/ShopModal';
import ChestModal from './ui/ChestModal';
import AlbumModal from './ui/AlbumModal';

type Screen = 'home' | 'game' | 'result';

interface LastRun {
  result: RunResult;
  settle: SettleResult;
  /** 结算前等级/经验（ResultScreen 经验条动画起点）。 */
  prevLevel: number;
  prevXp: number;
}

/**
 * 静音双源对齐：audio 模块的 'bigfish.muted' 为权威，
 * 启动时若与存档字段不一致，以 audio 为准回写存档。
 */
function syncMuteFromAudio(s: SaveData): SaveData {
  try {
    const audioMuted = localStorage.getItem('bigfish.muted') === '1';
    if (audioMuted !== s.muted) {
      const next = { ...s, muted: audioMuted };
      persistSave(next);
      return next;
    }
  } catch {
    /* 隐私模式等读取失败：保持存档原值 */
  }
  return s;
}

export default function App() {
  const [save, setSave] = useState<SaveData>(() => syncMuteFromAudio(loadSave()));
  const [screen, setScreen] = useState<Screen>('home');
  const [lastRun, setLastRun] = useState<LastRun | null>(null);
  const [justUnlockedShop, setJustUnlockedShop] = useState(false);
  const [showShop, setShowShop] = useState(false);
  const [showAlbum, setShowAlbum] = useState(false);
  const [showChest, setShowChest] = useState(false);

  // save 最新值 ref：onGameOver 里取「结算前」等级/经验，避免闭包过期
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  // Game → Result：记录结算快照（settle.save 已入账并持久化）
  const handleGameOver = useCallback(
    (result: RunResult, settle: SettleResult) => {
      const prev = saveRef.current;
      setLastRun({
        result,
        settle,
        prevLevel: prev.level,
        prevXp: prev.xp,
      });
      setSave(settle.save);
      setJustUnlockedShop(settle.justUnlockedShop);
      setScreen('result');
    },
    [],
  );

  // 局内首次见到某种鱼 → 图鉴登记（幂等，自带持久化）
  const handleDiscover = useCallback((fishId: string) => {
    setSave((prev) => addDiscovered(prev, fishId));
  }, []);

  // 静音切换：HomeScreen 内部已调 audio.setMuted（权威），这里同步存档字段
  const handleToggleMuted = useCallback(() => {
    setSave((prev) => setMutedFlag(prev, !prev.muted));
  }, []);

  const handleSelectFish = useCallback((fishId: string) => {
    setSave((prev) => selectFish(prev, fishId));
  }, []);

  // Result → Chest → Home
  const handleClaimChest = useCallback(() => setShowChest(true), []);
  const handleChestDone = useCallback(() => {
    setShowChest(false);
    setScreen('home');
  }, []);

  return (
    <>
      {screen === 'home' && (
        <HomeScreen
          save={save}
          justUnlockedShop={justUnlockedShop}
          onShopUnlockShown={() => setJustUnlockedShop(false)}
          onStart={() => setScreen('game')}
          onOpenShop={() => setShowShop(true)}
          onOpenAlbum={() => setShowAlbum(true)}
          onSelectFish={handleSelectFish}
          onToggleMuted={handleToggleMuted}
        />
      )}

      {screen === 'game' && (
        <GameScreen
          save={save}
          onGameOver={handleGameOver}
          onDiscover={handleDiscover}
        />
      )}

      {screen === 'result' && lastRun && (
        <ResultScreen
          result={lastRun.result}
          settle={lastRun.settle}
          prevLevel={lastRun.prevLevel}
          prevXp={lastRun.prevXp}
          onClaimChest={handleClaimChest}
        />
      )}

      {/* 主页浮层 */}
      {showShop && (
        <ShopModal
          save={save}
          onChange={setSave}
          onClose={() => setShowShop(false)}
        />
      )}
      {showAlbum && (
        <AlbumModal
          discovered={save.discovered}
          onClose={() => setShowAlbum(false)}
        />
      )}

      {/* 宝箱动画浮层（奖励在 settleRun 时已入账，此处只播动画） */}
      {showChest && lastRun && (
        <ChestModal chest={lastRun.settle.chest} onDone={handleChestDone} />
      )}
    </>
  );
}
