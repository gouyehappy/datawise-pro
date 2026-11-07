# Desktop 默认工作区模板

本目录是**入库的默认配置源**。用户首次创建工作区时，会整份复制到目标配置目录。

---

## 打包链路

```
resources/bundle-config/          ← 本目录（源，纳入 Git）
        │  npm run prepare:desktop / bundle-backend.mjs
        ▼
resources/desktop/config-bundle/  ← 构建产物（gitignore，可含 plugins/drivers）
        │  jpackage / Inno 安装布局
        ▼
安装包 resources/config-bundle/
        │  首次启动 bootstrapConfigDirectory()
        ▼
用户工作区（默认 %APPDATA%/…/workspaces，或 desktop-preferences.json 的 configDir）
```

---

## 目录内容

| 路径 | 说明 |
|------|------|
| `users.json` | 仅 guest（无预置口令）；首个注册账号自动成为租户管理员 |
| `workspace.xml` | 脚本根目录等全局工作区设置 |
| `teams.json` | 根目录 legacy 空快照（兼容旧逻辑；运行时以租户文件为准） |
| `tenants/index.json` | 默认租户索引 |
| `tenants/default/connections.xml` | 空连接目录 |
| `tenants/default/teams.json` | 空团队快照 |
| `tenants/default/oidc.json` | 本地登录（OIDC 关闭） |
| `tenants/default/roles.json` | 空；启动时由 TenantBootstrap 写入系统角色 |
| `tenants/default/memberships.json` | 空；启动时为注册用户补 membership |
| `tenants/default/sql-snippets.shared.xml` | 空团队共享片段 |
| `api-tokens.example.json` | API Token **示例**（勿当作正式 `api-tokens.json`） |
| `plugins/` · `drivers/` · `scripts/` | 占位；打包时由 bundle-backend 注入 JAR |

---

## 不要放进本目录

- `sessions.json`、`.datawise-master-key`、运行日志
- JDBC 驱动 / connector 插件 JAR（打包时从仓库 `config/plugins|drivers` 注入）
- 个人连接账号密码、真实 `api-tokens.json`

---

## 开发态

未打包时，桌面宿主同样以**本目录**为种子，不再用仓库根 `config/`，避免把开发脏数据带进新工作区。
