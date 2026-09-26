# 海盐折纸 · Sea Salt & Paper 网页版

桌游《Sea Salt & Paper》的纯前端网页实现：玩家 vs AI 对战，含完整规则引擎、AI 对手与扩展牌（Extra Salt）开关。

## 运行

纯静态页面，零依赖、零构建：

- 直接双击打开 `index.html` 即可游玩（`cards.html` 为全牌表校看页）。
- 或用任意静态服务器：`python -m http.server 8000`，访问 http://localhost:8000 。

## 目录结构

```
index.html      # 对局主页面
cards.html      # 全牌表页
css/
  style.css     # 主题与布局
  cards.css     # 牌面样式
js/
  cards.js      # 牌数据（卡面/颜色/扩展牌）
  rules.js      # 规则引擎（计分、连锁、触发）
  ai.js         # AI 对手决策
  ui.js         # 渲染与交互
  main.js       # 回合流程与状态机
```
