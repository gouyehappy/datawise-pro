# 跨环境数据对比

发布前核对两套环境是不是同一份数据：比行数，可选再比主键抽样（只在左边 / 只在右边）。比的是数据，不是表结构。结构差异仍用 DataWise 自带的 Schema 对比与迁移。

插件 id：`io.datawise.community.data-diff` · 版本 `0.2.0` · 需要 Host API `^1.5` 与权限 `host.sql`。

## 作用

开发库和预发库各有一条已经配好的 DataWise 连接时，不用再抄 JDBC 地址和密码。工作台列出你当前能看到的 SQL 连接，对两边各跑只读 SQL（经宿主的权限检查和 SQL review），算出：

- 行数以及差值（左 − 右）
- 若填写了主键列：各扫最多 500 个键，列出只在一侧出现的键（报告里每侧最多展示 50 个）

密码不会进插件。控制台只是被填上 SQL，不会自动执行。

## 准备

- 已重启过带 Host API 1.5 的 DataWise 后端
- 本机 `PATH` 上有 JDK 17+
- 左右环境在 DataWise 里已经各有一条可执行 SQL 的连接，并且当前账号看得到它们
- 要比的表名符合 `schema.table` 或 `table`（字母、数字、下划线）

## 安装

```bash
node community-plugins/data-diff/package.mjs
```

产物：`community-plugins/data-diff/dist/io.datawise.community.data-diff-0.2.0.dwp`

1. **社区插件** → 设置 → **允许未签名开发包**。
2. 安装该 `.dwp`。

## 操作

1. **新建连接** → **Plugins** → **数据对比工作区**。
2. 日常使用不要填 JDBC。那些字段是可选的 sidecar 备用通道。可以只填 **默认表**，例如 `public.orders`，打开工作台时会带进表名框。
3. 测试连接。JDBC 都留空时，成功提示表示走宿主 SQL 连接。
4. 打开 **数据对比工作台**。
5. **Left connection** / **Right connection** 各选一条已有连接。需要时填写各自的 database。
6. 二选一：
   - 填 **Table**，例如 `public.orders`
   - 或在 **SQL override** 里写一条 `SELECT ...`（同一段 SQL 会在两边各执行一次；行数用 `SELECT COUNT(*) FROM (你的 SQL) t` 计算）
7. 要看键差异时，**Key columns** 填逗号分隔的列名，例如 `id` 或 `tenant_id,id`。不填则只比行数。
8. 点 **Compare**。上方四格是左行数、右行数、差值和键差异；下方是 JSON 报告。
9. **Open left SQL** 把 `SELECT * FROM ... LIMIT 100`（或你写的 SQL）放进左侧连接的控制台，由你决定是否执行。
10. **Copy report** 复制 JSON 报告。

报告里 `keyScanCapped: true` 表示某一侧键已经扫到 500 行上限，未扫到的键不会出现在「只在一侧」列表里。把过滤写进 SQL override，缩小范围后再比。

## 排错

| 现象 | 处理 |
|------|------|
| 状态下拉框是空的，或提示没有 SQL 连接 | 先在 DataWise 里建好数据库连接，并确认当前用户能看见它们 |
| `permission host.sql is required` | 装的是 0.1.0，或后端未重启到 Host API 1.5。安装 `0.2.0` 的 `.dwp` |
| `host.sql allows read-only SQL only` | SQL override 里有 INSERT / UPDATE / DELETE 等写语句。只保留 SELECT |
| `SQL blocked by review` | 语句被宿主审查拦住（危险读、超限等）。改成普通 SELECT 再比 |
| `Table must look like schema.table` | 不要写引号、空格或函数。库名放到 database 输入框，表名用 `public.orders` 这种形式 |
| 行数差很多，但键列表是空的 | 没填 Key columns 时只比 `COUNT(*)`。填上主键列后再 Compare |
| 想连一个 DataWise 里还没有的库 | 先在 DataWise 新建那条 SQL 连接。不要把密码填进本插件。JDBC 字段仅在你明确要走 sidecar `diff/compare` 时使用，工作台主路径不会读它们 |
