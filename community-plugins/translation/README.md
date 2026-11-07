# Translation 即时翻译（DataWise 社区插件）

多引擎即时翻译工作台。**装好就能用**：内置免费翻译引擎（无需 API Key）。另支持 OpenAI 兼容大模型，以及可选的 DataWise **宿主 AI**（沿用宿主已配置的默认模型，密钥不进插件）。

## 能力（MVP 0.1.1）

- 输入即译 + 流式输出（`host.events`）
- 引擎：内置免费 · OpenAI 兼容 · 可选宿主 AI（`host.ai`）
- 引擎管理（增删改、默认、启用/禁用、排序、连通性测试）
- 翻译历史（搜索、收藏、删除；卡片 Enter 回填）
- 结果视图「发送 SQL 到翻译」/ 表节点「翻译名称…」（`translate/pendingTake`）
- 真粘贴（`host.clipboard`）· 导入导出优先剪贴板
- API Key 由侧车经系统密钥库加密落盘，前端不接触明文

## 开发

```bash
# 编译侧车
go build -C community-plugins/translation/backend -o datawise-plugin-translation.exe .

# 打包 .dwp
node community-plugins/translation/package.mjs

# 结构校验（源码态）
node community-plugins/scripts/verify-plugin.mjs community-plugins/translation
```

**源码态 vs 打包后校验**：源码里 `ui/index.html` 引用外部 `.js`/`.css` 属预期（与 http-client 相同）；`package.mjs` 会通过 `inline-static-ui.mjs` 内联后再打进 `.dwp`。CI/本机应以打包产物或「源码验允许外部脚本」理解为准，不要把源码态的「非自包含」当成发布阻断。

安装：DataWise → 社区插件 → 设置 → 允许未签名开发包 → 安装 `dist/*.dwp`。  
新建「翻译工作区」连接（只需名称）后打开工作台；内置免费引擎可直接译。

## 权限

`host.workbench` · `host.events` · `host.clipboard` · `host.ai`  
网络请求全部由侧车发出（不声明 `host.network`）。宿主 AI 走 DataWise 默认模型通道。

## 快捷键

| 键 | 作用 |
|---|---|
| `Ctrl/Cmd+Enter` | 翻译 |
| `Ctrl/Cmd+1` / `2` | 聚焦原文 / 译文区 |
| `Esc` | 取消在飞任务 |
| 引擎下拉 `↑↓` + `Enter` | 键盘选引擎 |

## 本机验收清单

1. DataWise → 社区插件 → 设置 → **允许未签名开发包**
2. 安装 `dist/io.datawise.community.translation-0.1.1-<target>.dwp`
3. 新建「翻译工作区」连接（只需名称）→ 打开工作台
4. 翻译页：免费引擎输入即译；工具栏无「流式」复选（在设置）；免费提示条独立成行
5. 粘贴按钮能写入原文；窄屏上下布局，拖分隔条可调比例
6. 引擎下拉末项「管理引擎…」；可选「宿主 AI」（需 DataWise AI 已配置）
7. 免费引擎失败时出现「配置 OpenAI / 改用宿主 AI」引导
8. 结果工具栏「发送 SQL 到翻译」或表节点「翻译名称…」：工作台已开也会立刻载入并开译（KeepAlive）
9. 宿主 AI 译文进历史；关闭工作台会取消在飞宿主 AI 流
10. 导出优先进剪贴板；导入可选剪贴板 JSON（同 1.5MB 上限）
11. 未持久化横幅可「复制诊断」；主题/语言跟随宿主

产物：`node community-plugins/translation/package.mjs`
