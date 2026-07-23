# Local WebSearch MCP Tool

本地浏览器驱动的网页搜索与 URL 读取 MCP 工具。保留你的登录状态、Cookie 和代理设置，使用 Playwright 进行浏览器自动化，内置反检测能力。

## 特性

- **持久登录状态** — 使用真实浏览器配置文件，保留 Cookie 和会话
- **隐身模式** — 自定义反爬虫检测技术，绕过自动化识别
- **Markdown 输出** — 通过 Readability + Turndown 提取干净内容（比 HTML 小 90%）
- **长驻服务** — 毫秒级响应，而非秒级冷启动
- **Cookie 管理** — 导入/导出 Cookie 以同步登录状态
- **自动重启** — 每 100 次请求或 1 小时空闲后自动重启浏览器，防止内存泄漏

---

## 安装

```bash
git clone <repo-url>
cd LocalWebSearch
npm install
npx playwright install chromium
npm run build

# 全局链接（可选，之后可用 npx localwebsearch 启动）
npm link
```

---

## MCP 接入指南

LocalWebSearch 是基于 **stdio** 的 MCP 服务器。在 MCP 客户端配置中添加：

```json
{
  "mcpServers": {
    "localwebsearch": {
      "command": "npx",
      "args": ["-y", "localwebsearch"]
    }
  }
}
```

**各客户端配置文件位置：**

| 客户端 | 配置文件路径 |
|--------|-------------|
| Claude Desktop (macOS) | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Claude Desktop (Windows) | `%APPDATA%\Claude\claude_desktop_config.json` |
| Cursor | Settings → MCP |
| Continue (VS Code / JetBrains) | `~/.continue/config.json`（放入 `experimental.modelContextProtocolServers` 数组，transport 设为 `{ "type": "stdio", "command": "npx", "args": ["-y", "localwebsearch"] }`） |

**设置环境变量**（在 MCP 配置的 `env` 字段中）：

```json
"env": {
  "LOCALWEBSEARCH_HEADLESS": "true",
  "LOCALWEBSEARCH_RESULTS": "5"
}
```

---

## MCP 工具列表

### `websearch` — 网页搜索

使用本地浏览器执行网页搜索，保留登录状态。

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `query` | string | ✅ | — | 搜索关键词 |
| `engine` | string | ❌ | `"google"` | 搜索引擎（目前仅支持 google） |
| `results` | number | ❌ | `10` | 返回结果数量（最大 10） |

**返回示例：**

```json
{
  "results": [
    {
      "title": "Example Page Title",
      "url": "https://example.com/page",
      "snippet": "A brief description of the search result..."
    }
  ]
}
```

---

### `urlread` — 网页读取

使用本地浏览器读取指定 URL 的内容，支持登录态访问。

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `url` | string | ✅ | — | 要读取的 URL 地址 |
| `markdown` | boolean | ❌ | `true` | 返回 Markdown（`true`）或原始 HTML（`false`） |
| `selector` | string | ❌ | `"body"` | 内容提取的 CSS 选择器（作为降级方案） |

**返回示例：**

```markdown
# Page Title

This is the cleaned content of the page in Markdown format.
Links, images, and formatting are preserved where possible.
```

---

## 配置

运行 `npx localwebsearch init` 在用户主目录下生成默认配置文件 `~/.localwebsearch/config.json`：

```json
{
  "engine": "google",
  "results": 10,
  "stealth": true,
  "timeout": 30000,
  "retries": 3,
  "browser": {
    "headless": false,
    "userAgent": null,
    "profilePath": "~/.localwebsearch/browser_profile"
  }
}
```

所有数据文件（浏览器配置、Cookie、缓存、日志等）统一保存在 `~/.localwebsearch/` 目录下，不会污染调用方项目目录。运行日志位于 `~/.localwebsearch/logs/`（按 1 MiB 轮转、gzip 压缩，保留最近 5 份归档）。

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `engine` | string | `"google"` | 搜索引擎 |
| `results` | number | `10` | 默认返回结果数 |
| `stealth` | boolean | `true` | 启用反检测 |
| `timeout` | number | `30000` | 页面加载超时（毫秒） |
| `retries` | number | `3` | 失败重试次数 |
| `browser.headless` | boolean | `false` | 无头模式（`true` = 不显示浏览器窗口） |
| `browser.userAgent` | string\|null | `null` | 自定义 User-Agent |
| `browser.profilePath` | string | `"~/.localwebsearch/browser_profile"` | 浏览器配置文件存储路径 |

环境变量（前缀 `LOCALWEBSEARCH_`，优先级高于配置文件）：`ENGINE`、`RESULTS`、`STEALTH`、`HEADLESS`。

---

## CLI 直接使用

```bash
npx localwebsearch websearch "TypeScript best practices" --results 10
npx localwebsearch urlread "https://example.com"
```

> **注意**: CLI 模式每次创建临时浏览器实例，速度较慢。推荐使用 MCP 服务器模式。

---

## 高级功能

### Cookie 导入/导出

```typescript
import { exportCookies } from './dist/cookie/export.js';
import { importCookies } from './dist/cookie/import.js';

await exportCookies(browserManager, './cookies.json');
await importCookies(browserManager, './cookies.json');
```

### 无头模式 vs 有头模式

- **有头模式**（默认）: 便于调试，可手动登录网站后保持会话
- **无头模式**: 适合服务器/CI 环境

> **推荐**: 首次使用有头模式登录常用网站，之后切换无头模式。

---

## 开发

```bash
npm run dev          # 开发模式（直接运行 TypeScript）
npm run build        # 编译
npm run test:run     # 运行测试
npm test tests/browser.test.ts  # 单个测试
```

---

## 常见问题

### Q: Google 搜索返回 0 条结果？

Google 反自动化机制可能导致拦截。建议：使用有头模式先手动通过验证、减少请求频率、交替使用不同关键词。

### Q: MCP 客户端连接失败？

1. 确认路径是**绝对路径**
2. 确认已运行 `npm run build`
3. 确认已安装 Playwright 浏览器：`npx playwright install chromium`
4. 检查 MCP 客户端日志中的错误信息

### Q: 如何在服务器/远程环境运行？

设置 `LOCALWEBSEARCH_HEADLESS=true`。确保系统已安装 Chromium 依赖库。

---

## 技术架构

```
请求流程:
MCP 工具调用 → BrowserManager.restartIfNeeded() → 创建新标签页 → 执行操作 → 关闭标签页 → 返回结果

内容处理管线:
页面加载 → DOM 就绪等待 → JSDOM 解析 → Readability 提取 → Turndown 转 Markdown
```

## 待办 (TODO)

### 支持多客户端 / 并发

当前架构基于 **stdio**，是 1 客户端 : 1 进程模型，**不支持**多客户端共享同一个常驻服务，也未为并发设计。具体限制：

- [ ] **传输层**：stdio 决定只有一个父进程。若要支持多客户端共享常驻服务，需改用 **Streamable HTTP** 传输（`@modelcontextprotocol/sdk` 已支持）。
- [ ] **进程级 profile 冲突**：多个进程默认指向同一 `~/.localwebsearch/browser_profile/`，Chromium 会对该 user-data-dir 加文件锁（`SingletonLock`），第二个进程启动会失败/降级。需改为每会话独立 profile 或加 profile 锁池。
- [ ] **单客户端并发竞态**：`BrowserManager` 的可复用页面池只有 1 个槽位，且 `restartIfNeeded()` / `close()` / `launchBrowser()` 无 mutex。需加请求队列/锁，把 `createPage → 操作 → releasePage` 串行化或改为每请求独立 context。

> 详见对话记录中的多客户端支持分析；如要推进，建议先走 brainstorming 拆解方案。

## 许可证

MIT
