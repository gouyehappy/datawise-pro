# 插件 Brief · <插件名>(填空后交给 AI 代理执行)

> 用法:复制本文件到你的插件目录(或直接在对话里填好贴给代理)。六节尽量都填;
> 不会填的留空并写「待定」,代理会按 Step 0 决策树给默认方案再向你确认。
> 代理执行入口:`community-plugins/AGENTS.md`;协议细节:`_private/docs/design/COMMUNITY_PLUGIN_DEV_PLAYBOOK.md`。

## 1 · 一句话定位

这个插件让用户在 DataWise 里做什么?(例:「连接 Redis 服务器,浏览/搜索/删除 Key,查看 TTL 与类型」)

```
<一句话>
```

## 2 · 连接(connection-provider)

要连什么?表单字段按下表填(`type`: text/number/password/textarea/select/boolean;
`binding` 槽位只能填: name/host/port/user/password/database/config/secret;密钥类必须 `secret` 或 type=password):

| key | label(中文) | type | binding | required | default | 说明/选项 |
|-----|--------------|------|---------|----------|---------|-----------|
| host | 主机 | text | host | ✓ | 127.0.0.1 | |
| port | 端口 | number | port | ✓ | 6379 | |
| <…> | | | | | | |

- 需要「测连接」按钮吗?(capabilities: test/connect/disconnect,默认都要)□ 是 □ 否
- 需要连接级动作按钮吗(如「导入私钥」回填表单)?□ 否 □ 是:__________
- 下发到 sidecar 时有没有方言别名?(如需 `username`)□ 否 □ 是:__________

## 3 · 工作台(workbench)

打开后长什么样、能做什么?(列面板/操作,尽量具体;参考现有插件形态更佳)

```
<例:左侧 Key 树(按 db 分组,支持 * 模式搜索),右侧详情面板:类型/值/TTL,
支持删除/重命名,底部受控控制台(只允许 GET/SCAN 白名单命令)>
```

## 4 · 私有 RPC(sidecar 方法清单)

前端会调哪些方法?(命名 `<域>/<动作>`,宿主不感知;长任务配合事件回报进度)

| 方法名 | 入参(关键字段) | 出参 | 说明 |
|--------|------------------|------|------|
| myplugin/list | {connectionId, pattern?} | {items:[…]} | |
| <…> | | | |

## 5 · 事件 / 二进制 / 文件贡献

- 事件推送(sidecar → UI,如进度/日志):□ 否 □ 是:__________
- 终端/PTY/文件流(选 framed + host.binary):□ 否 □ 是:__________
- 文件贡献:□ 无 □ 宿主文件 Tab(非 sessionBound,sidecar 实现 filesystem/*)
  □ 绑定连接、工作台内展示(sessionBound,UI 处理 reveal-files intent)

## 6 · 权限与参考

- 除 `host.workbench`(有工作台即需)外还要哪些?
  □ host.events □ host.binary □ host.filesystem □ host.clipboard □ host.sql
  □ host.embed(嵌第三方 https 页)□ host.network(直连外部 API,列 origin:__________)
- 最像的现有插件(决定复制模板):□ hello-workbench(Java 简单)□ docker(Go+Vue+终端)
  □ kubernetes(Go+React)□ ssh(会话绑定/SFTP)□ 其他:__________
- sidecar 语言偏好:□ Java □ Go □ Rust □ 听代理建议
- 多语言:界面文案中文为主?□ 是 □ 需中英双语(manifest 加 localizations)

---

**以下由代理在 Step 1 完成后回填(决策记录):**

| 项 | 值 |
|----|----|
| transport | |
| 模板来源 | |
| permissions 终值 | |
| 插件 id | |
