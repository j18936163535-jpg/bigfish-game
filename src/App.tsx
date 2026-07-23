// 大鱼吃小鱼 · App 根组件
// TODO(阶段3 集成): 替换为真实屏幕路由（HomeScreen / GameScreen / ResultScreen
// 及 ShopModal / ChestModal / AlbumModal 的组合），当前为阶段1 占位 stub。
export default function App() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(180deg, #0f3443 0%, #081c26 100%)',
      }}
    >
      <h1
        style={{
          margin: 0,
          fontSize: '2.25rem',
          fontWeight: 700,
          letterSpacing: '0.15em',
          color: '#f2b25c',
          textShadow: '0 0 24px rgba(242, 178, 92, 0.35)',
        }}
      >
        大鱼吃小鱼
      </h1>
    </div>
  )
}
