# Study Lock Extension / 学习锁浏览器扩展

Study Lock is a Chrome extension for focused study sessions.  
学习锁是一个用于专注学习会话的 Chrome 扩展。

It combines website blocking, ChatGPT prompt wrapping, and a strict burn mode to reduce distractions.  
它结合了网站拦截、ChatGPT 提示词包装和严格的破釜沉舟模式，帮助减少分心。

## Features / 功能

- Session timer with topic + duration (`Start session`, auto-end on timeout).  
  会话计时器：设置学习主题和时长（`Start session`，到时自动结束）。
- Dynamic allowlist browsing: only allowlisted domains are accessible during active session.  
  动态白名单浏览：会话期间仅可访问白名单域名。
- Block page redirect for disallowed websites.  
  非白名单网站自动重定向到拦截页。
- Options page for allowlist editing.  
  提供 Options 页面编辑白名单。
- Options lock during active session.  
  会话进行中会锁定 Options 编辑。
- Popup dashboard: current session, remaining time, allowlist summary.  
  Popup 面板：显示当前会话、剩余时间、白名单概览。
- ChatGPT top banner showing session topic and countdown.  
  ChatGPT 顶部提示栏显示会话主题与倒计时。
- Prompt wrapping on send (Enter and send button are both supported).  
  发送时自动包装提示词（支持回车发送和按钮发送）。
- One-click button send flow (no second click needed).  
  按钮发送支持单击完成（无需第二次点击）。
- Post-send UI cleanup: tries to restore visible text to raw user prompt.  
  发送后界面清理：尽量恢复显示为用户原始输入。
- Burn mode: manual stop is disabled until session timeout.  
  破釜沉舟模式：到时前禁止手动结束会话。
- Burn mode close guard: blocks page close/leave as much as browser APIs allow.  
  破釜沉舟关闭防护：在浏览器能力范围内尽可能拦截关闭/离开页面。
- Burn mode anti-tamper restore in background if session is prematurely cleared.  
  破釜沉舟防篡改：后台检测到会话被提前清空会自动恢复。

## Limitations / 限制说明

- Browser extensions cannot 100% prevent force-kill actions at OS level (for example Task Manager process kill).  
  浏览器扩展无法 100% 阻止操作系统级强制结束（例如任务管理器杀进程）。
- Prompt wrapping is a behavior constraint helper, not a guaranteed policy enforcement channel.  
  提示词包装属于行为约束辅助，不是绝对强制策略通道。

## Tech Stack / 技术栈

- TypeScript
- Vite
- Chrome Extension Manifest V3

## Project Structure / 项目结构

- `src/popup.*`: popup UI and session controls  
  `src/popup.*`：弹窗界面与会话控制
- `src/options.*`: allowlist management  
  `src/options.*`：白名单管理
- `src/background.ts`: dynamic rule sync, alarms, burn-mode protection  
  `src/background.ts`：动态规则同步、闹钟、破釜沉舟防护
- `src/content/chatgpt.ts`: ChatGPT banner + prompt wrapping  
  `src/content/chatgpt.ts`：ChatGPT 顶栏和提示词包装
- `src/content/close-guard.ts`: burn-mode page leave guard  
  `src/content/close-guard.ts`：破釜沉舟离开拦截
- `src/shared/storage.ts`: shared storage/session helpers  
  `src/shared/storage.ts`：共享存储与会话工具
- `public/manifest.json`: extension manifest  
  `public/manifest.json`：扩展清单

## Development / 本地开发

1. Install dependencies / 安装依赖

```bash
npm install
```

2. Build extension / 构建扩展

```bash
npm run build
```

3. Load in Chrome / 在 Chrome 加载扩展

- Open `chrome://extensions`  
  打开 `chrome://extensions`
- Enable Developer Mode  
  开启开发者模式
- Click `Load unpacked` and select this repo's `dist` folder  
  点击“加载已解压的扩展程序”，选择本仓库的 `dist` 目录

## Usage / 使用说明

1. Open popup and set topic + minutes.  
   打开 popup，填写学习主题和时长。
2. Optional: enable Burn mode before starting session.  
   可选：开始前勾选 Burn mode。
3. Start session.  
   点击开始会话。
4. During session:
   会话期间：
   - non-allowlisted websites are blocked  
     非白名单网站会被拦截
   - options editing is locked  
     options 编辑会锁定
   - ChatGPT prompt wrapping is active  
     ChatGPT 自动提示词包装生效
5. Session ends automatically at timeout.  
   到时后会话自动结束。

## Roadmap / 后续计划

- Emergency unlock flow with cooldown or passphrase  
  增加带冷却时间或口令的紧急解锁机制
- Study statistics dashboard (daily focus time, streaks)  
  增加学习统计面板（每日专注时长、连续天数）
- Multiple profile presets (normal / exam / burn)  
  增加多套模式预设（普通 / 考试 / 破釜）
- Optional cloud sync for settings and session history  
  支持设置与会话历史的可选云同步

## License / 许可证

MIT (see `LICENSE.txt`)  
MIT（见 `LICENSE.txt`）

