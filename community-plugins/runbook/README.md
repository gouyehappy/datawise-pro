# Runbook Runner

把本机 YAML 运维剧本跑成一步一步的操作：说明、复制命令、打开 SQL 控制台、HTTP 探测、检查清单。

插件 id：`io.datawise.community.runbook` · 版本 `0.1.0` · Host API `^1.5`

## 打包

```bash
node community-plugins/runbook/package.mjs
```

## 操作

1. 安装 `community-plugins/runbook/dist/io.datawise.community.runbook-0.1.0.dwp` 并重启后端。
2. 新建连接 → **剧本库**。没有目录时点 **使用自带示例剧本**。
3. 打开工作台，左侧选剧本。一次只激活一步。
4. 主按钮随步骤变化：复制命令、打开控制台、发送请求、完成本步。失败留在当前步，可重试。
5. **导出** 把进度和备注复制成 Markdown。

剧本文件名以 `.runbook.yml` 结尾。字段见 `_private/docs/design/COMMUNITY_OPS_PLUGINS_P0.md`。
