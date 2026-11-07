# 社区插件开发 · AI 代理执行规范(入口)

> 深层参考(按需读,不必全读):协议全文 [`_private/docs/design/COMMUNITY_PLUGIN.md`](../_private/docs/design/COMMUNITY_PLUGIN.md) ·
> 端到端 Playbook [`_private/docs/design/COMMUNITY_PLUGIN_DEV_PLAYBOOK.md`](../_private/docs/design/COMMUNITY_PLUGIN_DEV_PLAYBOOK.md) ·
> 本文件是执行索引:每步只给「做什么 + DoD + 深读锚点」,细节去 Playbook 对应章节查。

## 铁律(违反 = 返工,先记住再动手)

1. **宿主零特例**:主仓(datawise-frontend/datawise-backend)不得出现插件 id、私有 RPC 名、per-pluginId 文案或 `if (pluginId===…)`。
2. 展示文案(名称/字段 label/选项/描述)只写在 manifest(+`localizations`),不写在宿主。
3. 前端只经 `window.datawisePlugin` 与外界通信;不碰宿主 DOM、不假设桥内部 `host.*` 方法名。
4. sidecar 的 stdout 只有协议帧,日志一律 stderr;密钥不落盘、不打日志。
5. `ui/index.html` 必须自包含(无外部 `<script src>/<link href>`),打包期强制校验。
6. 颜色只用宿主 token(`--color-*`),跟随 `data-theme`,禁止写死配色。
   **字体/字号契约**(详 [`docs/PLUGIN_TYPOGRAPHY.md`](docs/PLUGIN_TYPOGRAPHY.md)):
   - 正文唯一基准 = 宿主 `--dw-font-size`(无配置则默认);字体同理 `--font-sans` / `--font-mono`。
   - 插件内要小/大一点:用 `var(--dw-text-xs|2xs|lg|…)`(bootstrap 已设为正文的 0.75/0.85/1.15… 倍),或 `calc(var(--dw-font-size) * 0.9)`。
   - **禁止**裸 `font-size: 12px` / 品牌字体;改宿主设置 **不必**重打包。
   - 参考 `shared/plugin-typography.css`。
7. 需要新能力时升级 hostApi/permission/贡献点字段,**不**要求宿主加特例分支。

## Step 0 · 决策树(先定形态,再复制模板)

```text
Q1 有交互终端/文件流/PTY/大文件传输? ──是──▶ transport = stdio-framed + permission host.binary
   │否                                        (参考 ssh / docker)
   └──▶ transport = stdio-jsonl(默认;参考 hello / kubernetes)

Q2 sidecar 语言?
   ├─ 复用 JVM 生态(JDBC/dbt/工具链) ──▶ Java(community-plugin-sdk, hello-workbench 同款,产物 jar 跨平台)
   ├─ 单文件分发 / Go 生态            ──▶ Go(docker/backend/sdk,即 dbx-plugin-sdk)
   └─ 高性能终端/加密                 ──▶ Rust(参考 ssh,自实现 framed 编解码)

Q3 前端?
   ├─ 极简(几个按钮/列表) ──▶ 零构建原生 HTML(hello-workbench 同款)
   ├─ Vue 3 ────────────────▶ 复制 docker 的 frontend 工程(vite-plugin-singlefile)
   └─ React ────────────────▶ 参考 kubernetes(DATAWISE_INLINE=1 构建)
```

**模板映射(复制起点):**

| 你的形态 | 复制 | 复制后必改清单 |
|---|---|---|
| Java + jsonl(最常见) | `examples/hello-workbench` | manifest 的 id/name/版本/贡献点 id;`package.mjs` 的 pluginId/jarName;Java 包名 `org.apache.datawise.hello`→你的;`handle()` 业务分支 |
| Go + framed + Vue | `docker` | manifest id;`backend/` Go module 名;`package.mjs` exeName/id;`src/` 页面 |
| Go + jsonl + React | `kubernetes` | 同上;`localizations` 文案 |
| 会话绑定(SFTP 类) | `ssh` | `sessionBound:true` FS + `reveal-files` intent 处理 |
| 会话副驾(Ask/Agent) | 引擎 `shared/copilot-kit` + 目标 adapter | 参考 `ssh/frontend/src/copilot/adapter.ts`；勿把副驾逻辑只埋在 SSH 里 |

## Step 1–9 · 执行序列(每步完成即自查 DoD,再进下一步)

| # | 步骤 | 做什么(一句话) | DoD(完成判据) | 深读 |
|---|------|----------------|----------------|------|
| 1 | Brief | 让用户填 `docs/PLUGIN_BRIEF_TEMPLATE.md`(或据对话代填并确认) | Brief 六节全非空 | Playbook §0 |
| 2 | 脚手架 | 按 Step 0 复制模板 + 改名清单;目录符合规范(manifest/package.mjs/assets/frontend/backend|sidecar/ui/dist) | `verify-plugin.mjs <dir>` 结构项 PASS | Playbook §4 |
| 3 | manifest | 写 `manifest.json`(原生二进制用 `manifest.datawise.json`):id/版本/权限/engines `^1.6`/entrypoints/贡献点/`localizations` | verify 的 manifest 项全 PASS | Playbook §5 |
| 4 | sidecar | 生命周期 RPC(`plugin/initialize`→ok;`connection/test|connect|disconnect`;声明了才有 action/FS/challenge)+ 私有 RPC;未实现抛 `-32601` | 本机手跑 `echo '{"jsonrpc":"2.0","id":1,"method":"plugin/initialize","params":{}}' | <exe>` 收到 ok | Playbook §6 + 附录A |
| 5 | 前端 | 入口 `await datawisePlugin.ready` → context → `invoke` 私有 RPC;token 化样式;事件/二进制按需;持久化用 `storage.*` | 手测四项:打开工作台/亮暗切换即时翻转/语言切换/重启后 storage 仍在 | Playbook §7 + 附录B |
| 6 | 打包 | `node package.mjs` → `dist/<id>-<version>[-<target>].dwp` | 打包成功且 `assert-ui-inlined` 不报错;verify 全 PASS | Playbook §8 |
| 7 | 签名 | 需发布才做:keygen → 公钥入宿主信任库 → 打 `-signed` 包 | SIGNED 策略安装通过 | Playbook §9 |
| 8 | 安装调试 | 宿主开「允许未签名开发包」→ 安装 .dwp → 手测连接/工作台/新会话/关闭回收 | §11 流程清单逐项过 | Playbook §10 |
| 9 | 验收 | 干净宿主全链路 + Playbook §11 清单 | 清单全绿 | Playbook §11 |

## 随时自查(机器可验证,不用装宿主)

```bash
node community-plugins/scripts/verify-plugin.mjs community-plugins/<my-plugin>
# 输出逐项 ✅/⚠️/❌ + 下一步建议;存在 ❌ 则退出码 1
```

覆盖:manifest 结构/id/版本/权限白名单/engines/binding 槽位/贡献点类型引用/framed-binary 一致性/图标存在/ui 自包含。

## 卡住时查(症状 → 去处)

- 前端白屏/样式丢/`localStorage` 报错/CSP 拦截/超时 → Playbook **附录 B**(10 个常见坑)
- RPC 参数/响应记不清 → Playbook **附录 A**(速查表)
- 字段 schema(options_action/visible_when/picker/actions)→ Playbook §5.2
- 主题/语言跟随 → Playbook §7.4–7.5;终端/流 → §7.7
