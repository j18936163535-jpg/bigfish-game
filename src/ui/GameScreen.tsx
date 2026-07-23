// =============================================================
// 大鱼吃小鱼 · 游戏屏（canvas + 摇杆宿主 + GameHud 的组合容器）
// - useEffect 构造 GameScene（player=selectedFish 对应 PlayerFishSpec，
//   mods=getRunModifiers(save)）并 start；卸载 destroy —— StrictMode
//   双跑安全（每次 mount 新建、cleanup 销毁，幂等）。
// - onHud → setState；onEnd → settleRun → 回调父级进入结算；
//   onDiscover → 透传父级（父级用 addDiscovered 持久化）。
// - 桌面快捷键：空格=技能，B=炸弹，Esc/P=暂停切换。
// 「结束本局」直接调 GameScene.quit()（契约外补充方法），由场景用
// 真实统计（score/coins/maxTier/kills/duration）合成 RunResult。
// =============================================================
import { useEffect, useRef, useState } from 'react';
import { audio } from '../game/audio';
import { playerFish } from '../game/data/playerFish';
import { GameScene } from '../game/scene/GameScene';
import type { HudState, RunResult, SaveData } from '../game/types';
import { getRunModifiers, settleRun } from '../store/economy';
import type { SettleResult } from '../store/economy';
import GameHud from './GameHud';

export interface GameScreenProps {
  save: SaveData;
  /** 本局结束（eaten 或 quit）：已代为 settleRun，回传原始结果与结算。 */
  onGameOver(result: RunResult, settle: SettleResult): void;
  /** 局内首次见到某种鱼：父级应 addDiscovered 并回传新 save。 */
  onDiscover(fishId: string): void;
}

export default function GameScreen(props: GameScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const joyRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<GameScene | null>(null);

  const [hud, setHud] = useState<HudState | null>(null);
  const [paused, setPaused] = useState(false);

  // 最新 props ref，供场景回调使用（避免闭包过期）
  const propsRef = useRef(props);
  useEffect(() => {
    propsRef.current = props;
  });

  const endedRef = useRef(false);

  // 结算一次并通知父级（幂等：一局只结算一次）
  const finish = (r: RunResult) => {
    if (endedRef.current) return;
    endedRef.current = true;
    const settle = settleRun(propsRef.current.save, r);
    propsRef.current.onGameOver(r, settle);
  };
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = joyRef.current;
    if (!canvas || !host) return;

    const save = propsRef.current.save;
    const player =
      playerFish.find((f) => f.id === save.selectedFish) ?? playerFish[0];
    if (!player) return; // playerFish 为空则不启动（内容代理未就绪）

    endedRef.current = false;

    const scene = new GameScene({
      canvas,
      player,
      mods: getRunModifiers(save),
      joystickHost: host,
      onHud: (h: HudState) => setHud(h),
      onEnd: (r: RunResult) => finishRef.current(r),
      onDiscover: (id: string) => propsRef.current.onDiscover(id),
    });
    sceneRef.current = scene;
    scene.start();
    audio.startBgm();

    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        scene.useSkill();
      } else if (e.code === 'KeyB') {
        scene.useBomb();
      } else if (e.code === 'Escape' || e.code === 'KeyP') {
        setPaused((prev) => {
          const next = !prev;
          scene.setPaused(next);
          return next;
        });
      }
    };
    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('keydown', onKey);
      scene.destroy();
      if (sceneRef.current === scene) sceneRef.current = null;
      audio.stopBgm();
    };
    // 一局只在挂载时创建一次；save 变化（如图鉴发现）不重建场景
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyPause = (p: boolean) => {
    setPaused(p);
    sceneRef.current?.setPaused(p);
  };

  /** 「结束本局」：由场景用真实统计合成 RunResult（含 kills），onEnd 幂等。 */
  const handleQuit = () => {
    sceneRef.current?.quit();
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#081c26]">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {/* 虚拟摇杆宿主：左下安全区内，Joystick 类在其中自建 DOM */}
      <div
        ref={joyRef}
        className="safe-bottom safe-left absolute bottom-6 left-4"
        style={{ width: 120, height: 120 }}
      />
      {hud && (
        <GameHud
          hud={hud}
          paused={paused}
          onUseSkill={() => sceneRef.current?.useSkill()}
          onUseBomb={() => sceneRef.current?.useBomb()}
          onPause={() => applyPause(true)}
          onResume={() => applyPause(false)}
          onQuit={handleQuit}
        />
      )}
    </div>
  );
}
