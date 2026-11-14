# DataWise Backend

Spring Boot 3 多模块 API — 连接、SQL 执行、AI、平台任务与团队治理的服务端。

版本 **5.0.0** · Java **17** · Spring Boot **3.3.x** · 入口模块 **`datawise-server`**

---

## 做什么

| 模块 | 职责 |
|------|------|
| `datawise-server` | HTTP API 入口、鉴权、健康检查 |
| `datawise-database` | 连接、Schema、SQL 执行与结果 |
| `datawise-workspace` | 工作区、脚本、书签、会话 |
| `datawise-ai` | Text-to-SQL、分析流、语义相关 |
| `datawise-connectors` | 数据源插件 SPI 与各方言实现 |
| `datawise-config` | 租户 / 用户配置读写 |
| `datawise-common` | 共享模型与工具 |
| 其他 | `sqlparser` · `sqlflow` · `lineage` · `sync` · `datagen` · `metadoc` · `taskconcurrency` |

连接器 JAR 构建后放入仓库根 `config/plugins/`，由服务热加载。完整列表见 `datawise-connectors/`（约 37 个数据源插件）。

---

## 启动

```bash
cd datawise-backend
mvn spring-boot:run -pl datawise-server -am
```

| 项 | 值 |
|----|-----|
| 开发地址 | `http://localhost:18421`（`profile=dev`） |
| 桌面内嵌 | `http://127.0.0.1:18423`（`profile=desktop`） |
| 健康检查 | `GET /api/health` |
| 配置目录 | 仓库根 [`config/`](../config/) |

与前端端口对齐见 [`datawise-frontend/runtime-ports.json`](../datawise-frontend/runtime-ports.json)。

**首次配置**

```bash
cp ../config/connections.xml.example ../config/connections.xml
cp ../config/users.json.example ../config/users.json
```

部署、鉴权、JDBC 元数据、多实例：[../docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md)  
密钥与 `dwsecret:`：[../docs/SECRETS.md](../docs/SECRETS.md)

---

## 测试

```bash
mvn test
mvn test -pl datawise-database -am
```

CI：`.github/workflows/backend-tests.yml`

---

## OpenAPI

后端运行时导出契约：

```bash
node ../scripts/export-openapi.mjs
```

说明见 [../docs/OPENAPI.md](../docs/OPENAPI.md) · [../docs/openapi/](../docs/openapi/)

---

## 相关

- 前端联调：[../datawise-frontend/README.md](../datawise-frontend/README.md)
- 文档索引：[../docs/README.md](../docs/README.md)
- 产品概览：[../README.zh-CN.md](../README.zh-CN.md)
