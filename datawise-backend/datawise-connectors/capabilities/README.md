# 连接能力矩阵（产品声明）

> 程序：[CONNECTION_CAPABILITY_MATRIX.md](../../../_private/docs/design/CONNECTION_CAPABILITY_MATRIX.md) · **T-CAP-1**

本目录是 **产品级** 能力声明源（与 SPI `ConnectorCapability` / `db-type-profiles.properties` 互补）：

| 层 | 职责 |
|----|------|
| `ConnectorCapability` + catalog API | 连接器插件真实协议能力（SQL_EXECUTE、DML…） |
| **本矩阵** | 工作台产品功能显隐（diagram、VQB、schemaCompare、transactionalDdl、specializedSurface…） |

## 文件

| 路径 | 说明 |
|------|------|
| `_schema.json` | 允许的 feature / formKind / supportLevel 键 |
| `_families/*.json` | 可 `extends` 的家族默认 |
| `{dbType}.json` | 每个引擎一份；未列出的 dbType → 保守默认（仅 metadataBrowse） |

## 生成

```bash
node scripts/generate-connection-capabilities.mjs
node scripts/generate-connection-capabilities.mjs --check   # CI：生成物漂移则失败
```

产物：

- `datawise-frontend/src/shared/capabilities/generated/connection-capability-matrix.ts`
- `datawise-backend/datawise-connectors/datawise-connector-spi/src/main/resources/connection-capability-matrix.json`

## 字段

- `dbType`（必填，与文件名一致）
- `extends`（可选家族 id，如 `jdbc-operate`）
- `supportLevel`: `connect` | `browse` | `query` | `operate`
- `specializedSurface`: 非 SQL 专项工作台
- `formKind`: `standard` | `jdbc` | `mq` | `redis` | `mongo` | `document` | `ssh` | `ops` | `other`
- `features`: 布尔图；未写的 key = `false`（合并家族后）

## 表单描述符（MetaForge S1）

`forms/*.json` 声明内置连接表单字段（与社区插件 `connection-provider.fields[]` 同构：`binding` / `visible_when` / `required_when`）。前端 `builtin-connection-form-fields.ts` 消费同构 packs（jdbc / oracle / redis / kafka / kudu / elasticsearch / jenkins / polaris / yarn / kubernetes / ssh）。仍手写：nacos（命名空间选择器对话框）。

修改后请重新生成并提交产物。
