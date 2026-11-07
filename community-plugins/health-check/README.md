# Health Checklist

值班巡检板：对 `*.suite.yml` 里的目标做 TCP、HTTP 和只读 SQL 探测，结果可复制成汇报。最近 20 次摘要存在插件存储里。

插件 id：`io.datawise.community.health-check` · 版本 `0.1.0` · Host API `^1.5`

## 打包

```bash
node community-plugins/health-check/package.mjs
```

## 操作

1. 安装 `community-plugins/health-check/dist/io.datawise.community.health-check-0.1.0.dwp` 并重启后端。
2. 新建连接 → **巡检配置**。点 **使用自带示例**，或把目录指到自己的 `*.suite.yml`。
3. 打开工作台。底部选一条 DataWise SQL 连接（给 `sql_readonly` 用）。
4. **全部巡检** 或 **重跑失败**。勾选「只看失败」过滤表格。
5. **复制报告** 得到 Markdown 值班摘要。

红黄绿只出现在状态列。格式见 `_private/docs/design/COMMUNITY_OPS_PLUGINS_P0.md`。
