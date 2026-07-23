# src/ui · 元游戏 UI 组件契约（供阶段3 集成者使用）

> 作者：阶段2-D 元UI。所有组件均为受控组件（presentational），
> 存档状态由集成者（App.tsx）持有，组件通过回调回传新状态。
> 视觉基调：深海 `#0f3443→#081c26` + 琥珀 `#f2b25c` / 珊瑚 `#e8845f`，文案全中文。

## 依赖的兄弟模块导出名（契约之外的经验假设，集成时若不符只需改 import）

| 模块 | 假设导出 | 状态 |
|------|----------|------|
| `game/data/fish.ts` | `fish: FishSpec[]` | ✅ 已落地，名字确认 |
| `game/data/playerFish.ts` | `playerFish: PlayerFishSpec[]` | ⏳ 未就位（假设名） |
| `game/data/items.ts` | `shopItems: ShopItemDef[]` | ⏳ 未就位（plan §5 明示此名） |
| `game/audio.ts` | `audio`（§2.1 契约） | ⏳ 未就位（契约保证） |
| `game/scene/GameScene.ts` | `GameScene`（§2.1 契约） | ⏳ 未就位（契约保证） |

`FishSpec.sprite` / `PlayerFishSpec.sprite` 均按完整路径 `/assets/fish/<id>.png`
处理；UI 层对裸 id 也做了兼容（`fishImg` 兜底补前缀）。

## store 层 API（src/store/）

```ts
// save.ts（契约 §2.1）
loadSave(): SaveData            // 坏档/缺字段自动清洗回退 freshSave 语义
persistSave(s): void            // 写失败静默（隐私模式不崩）
freshSave(): SaveData           // 初始鱼 bubbles 默认解锁并选中

// economy.ts（契约 §2.1）
getRunModifiers(save): RunModifiers   // 按已购商品汇总（plan §5 数值）
priceOf(item, ownedLevel): number     // base×growth^owned，满级 Infinity
xpNeed(level): number                 // round(100×level^1.5)
settleRun(save, result): SettleResult // 见下；返回的新存档已持久化

// economy.ts 契约外补充（UI 已使用，集成者可直接复用）
tryBuyItem(save, item): { save, ok }  // 购买（扣款+升级+持久化）
selectFish(save, fishId): SaveData    // 选中初始鱼（校验已解锁）
setMutedFlag(save, muted): SaveData   // 静音持久化
addDiscovered(save, fishId): SaveData // 图鉴发现（幂等）
chestForScore(score): ChestReward     // 预览宝箱（settleRun 内部也用）
SettleResult = { save, xpGained, levelUps, newFish, chest, justUnlockedShop }
```

注意：`settleRun` 内宝箱金币/经验、本局金币/经验**已入账**并持久化，
`bestScore/totalEaten/playSeconds` 也已维护；ChestModal 只是「播放动画」，
不要再重复加钱。

## 组件 props

### HomeScreen（主页）
```ts
{
  save: SaveData;
  justUnlockedShop?: boolean;    // 透传 settle.justUnlockedShop
  onShopUnlockShown?: () => void; // 动画播完，父级清除 justUnlockedShop 标记
  onStart(): void;                // 点开始（集成者切到 GameScreen）
  onOpenShop(): void;
  onOpenAlbum(): void;
  onSelectFish(fishId): void;     // 建议：setSave(selectFish(save, id))
  onToggleMuted(): void;          // 建议：setSave(setMutedFlag(save, !save.muted))
}
```
- 静音按钮内部已调 `audio.setMuted(!save.muted)`；父级只需更新存档。
- 首次 pointerdown 自动 `audio.unlock()`（iOS 手势限制）。

### ShopModal（商店）
```ts
{ save: SaveData; onChange(next: SaveData): void; onClose(): void }
```
- 购买逻辑（tryBuyItem + 音效 + 弹跳）内置；父级 `onChange` 里 setSave 即可。

### ChestModal（宝箱动画）
```ts
{ chest: ChestReward; onDone(): void }  // onDone = 看完动画，回主页
```

### ResultScreen（结算屏）
```ts
{
  result: RunResult;
  settle: SettleResult;
  prevLevel: number; prevXp: number;  // 结算前的等级/经验（经验条动画起点）
  onClaimChest(): void;               // 打开 ChestModal
}
```

### AlbumModal（图鉴）
```ts
{ discovered: string[]; onClose(): void }  // 传 save.discovered
```

### GameScreen（游戏屏，自含 GameScene 生命周期）
```ts
{
  save: SaveData;
  onGameOver(result: RunResult, settle: SettleResult): void; // settleRun 已代做
  onDiscover(fishId): void;   // 建议：setSave(addDiscovered(save, id))
}
```
- 每局挂载即开新场景、卸载销毁（StrictMode 双跑安全）。
- 桌面快捷键：空格=技能 / B=炸弹 / Esc·P=暂停。

## 推荐页面流转（App.tsx 集成模板）

```
type Screen = 'home' | 'game' | 'result';

App 状态:
  save = useState(loadSave)
  screen = useState<Screen>('home')
  result/settle/prevLevel/prevXp = 最近一局的结算快照
  justUnlockedShop = bool（进入 home 时透传给 HomeScreen）
  showShop / showAlbum / showChest = bool

Home ──onStart──▶ Game ──onGameOver(r, s)──▶ 记录 prevLevel/prevXp(结算前)
                                             setSave(s.save)
                                             justUnlockedShop = s.justUnlockedShop
                                             screen='result'
Result ──onClaimChest──▶ showChest=true（Result 可保留在底层或直接卸载）
ChestModal ──onDone──▶ showChest=false, screen='home'
Home: justUnlockedShop 播一次动画 → onShopUnlockShown 置 false
ShopModal/AlbumModal 作为 home 上的浮层，条件渲染即可：
  {showShop && <ShopModal save={save} onChange={setSave} onClose={...} />}
```

## 已知契约缺口（局部适配，集成者可决定是否推回兄弟代理）

1. **GameScene 无 `quit()`**：「结束本局」由 GameScreen 用最近 HUD 快照合成
   `RunResult{cause:'quit'}`。且 **HudState 不含 kills**，quit 局 kills 记 0，
   会轻微低估 `totalEaten`（eaten 局不受影响）。
2. **FishSpec 无 `desc`**：图鉴简介用 tier+behavior 本地生成。
3. **技能/道具音效归属**：HUD 只调 `scene.useSkill()/useBomb()`，
   假设场景自己播音效；UI 按钮仅播放 `ui/coin/unlock/levelup/chest*`。
