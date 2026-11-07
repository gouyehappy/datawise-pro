# Log Controller（社区插件）

多机日志查询工作台：为同一微服务登记多台实例主机（共享日志目录），经 SSH/SFTP 拉取各实例日志并合并检索。

| 项 | 说明 |
|----|------|
| 包格式 | `.dwp` |
| 插件 id | `io.datawise.community.log-controller` |
| Transport | `stdio-framed` |
| Sidecar | Rust `datawise-plugin-log-controller` |
| 当前版本 | `0.1.54` |

协议：[`_private/docs/design/COMMUNITY_PLUGIN.md`](../../_private/docs/design/COMMUNITY_PLUGIN.md)

## 解决什么问题

以前查微服务 A 的日志：SSH 到 `host1` / `host2` / `host3`，目录都是 `/var/log/a`，分别 `tail` / `grep`。

现在：

1. 建一个「日志服务组」连接（服务名 + 共享目录 + SSH 凭据）
2. 工作台里动态添加各实例主机
3. 一次查询，按时间戳合并各实例日志，行上标注来源

## 连接字段

菜单里只需要建一个连接，填「连接名称」即可（例如「日志查询」）。

打开工作台后点「配置」，实时填写：

| 字段 | 说明 |
|------|------|
| 服务名 | 可选，便于识别当前查询 |
| 共享日志目录 | 各实例上的同一路径；也可在单台实例里覆盖 |
| 默认登录 | SSH 用户 / 密码或私钥；单台实例可单独填写 |
| 跳板机 | 可选。目标不能直连时，先登录跳板再进入各实例 |

这些配置会记住在本机插件存储里，下次打开可直接用。

## 工作台能力

- 动态添加 / 编辑 / 启用 / 删除服务器（按连接持久化到 `datawisePlugin.storage`）
- **探测全部**：SSH + 列出匹配日志文件
- **查询**：多个关键字（逗号或 `|`，需同时包含）；包含 / 整词 / 精准 / 正则；忽略大小写；排除同样支持多个词
- **尾部 / 跟随**：`tail -n` 拉取最近 N 行；「跟随」持续刷新，等同 `tail -nf`
- **列出文件**：各主机目录下匹配文件一览
- **可读展示**：完整时间戳、类名与服务名只显示最后一段、级别色条

## 私有 RPC

| Method | 说明 |
|--------|------|
| `logs/group` | 当前服务组摘要 |
| `logs/probe` | 探测连通性与文件 |
| `logs/files` | 列出匹配日志文件 |
| `logs/search` | 多机检索并合并 |
| `logs/tail` | 多机尾部拉取并合并；可带 `cursors` 做增量跟随 |
| `logs/keepalive` | 保活 JumpServer / SSH 会话 |
| `logs/reconnect` | 单台实例断线重连 |

## 构建

```bash
node community-plugins/log-controller/package.mjs
# node community-plugins/log-controller/package.mjs --skip-backend
```

产物：

```text
community-plugins/log-controller/dist/io.datawise.community.log-controller-<ver>-<os-arch>.dwp
```

安装：DataWise → 社区插件 → 允许未签名开发包 → 本地安装上述路径。

## 许可

Apache-2.0（见 `LICENSE`）。
