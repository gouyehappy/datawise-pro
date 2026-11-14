# DuckDB 文件库

对本机 DuckDB 文件，或一个目录里的 Parquet / CSV / JSON，直接跑 SQL。不用先把文件灌进 MySQL 或数仓。

插件 id：`io.datawise.community.duckdb` · 版本 `0.1.0`。

和 Files Studio 的分工：Files Studio 负责浏览和传输文件；这个插件负责对文件下 SQL。

## 作用

分析师拿到一份 Parquet 或 CSV 时，可以在 DataWise 里立刻查询、看结果网格，而不必先建库、导表。查询跑在插件自带的 DuckDB 里，不占用你已有的数据库连接。

## 准备

- DataWise `>=4.1.0`
- 本机 `PATH` 上有 JDK 17+
- 若查文件：准备一个目录，里面是 `.parquet`、`.csv`、`.tsv`、`.json` 或 `.jsonl`

## 安装

```bash
node community-plugins/duckdb/package.mjs
```

产物：`community-plugins/duckdb/dist/io.datawise.community.duckdb-0.1.0.dwp`

1. 打开 **社区插件** → 设置 → **允许未签名开发包**。
2. 安装该 `.dwp`。

## 一键预览（T-FILE-1）

安装本插件后，宿主会读取 manifest 里的 `localDataPreview.extensions`（不硬编码插件 id）：

- Welcome → **本地数据文件**
- Explorer 本地文件树 → 右键 **表格预览…**（`.parquet` 双击也会走预览）

宿主打开工作台时带上中性 intent `preview-local-file`；本 UI 会 `register` 该文件并执行 `SELECT * … LIMIT 100`。

## 操作

1. **新建连接** → **Plugins** → **DuckDB / 文件**。
2. 按场景填写：

   | 场景 | 数据库文件 | 数据目录 | 只读 |
   |------|------------|----------|------|
   | 临时查几个文件 | `:memory:` | 填目录，例如 `C:\data\lake` | 内存库会自动关掉只读 |
   | 打开已有库 | `C:\data\analytics.duckdb` | 可空 | 默认勾选只读 |
   | 可写的本地库 | 同上，指向要写入的 `.duckdb` | 可空 | 取消只读 |

3. 测试连接。成功表示 DuckDB 能执行 `SELECT 1`。
4. 打开 **DuckDB 工作台**。
5. 连接时，数据目录下两层以内、最多 40 个 Parquet/CSV 会自动注册成视图，名字来自文件名（去掉扩展名，非字母数字变成 `_`）。
6. 左侧 **Refresh** 刷新表和视图。点某个名字，编辑器会填入 `SELECT * FROM "名字" LIMIT 100`。
7. 点 **Files** 再扫一遍目录（最多往下 3 层、200 个文件）。点某个文件会 `CREATE OR REPLACE VIEW`，并填好查询。
8. 改 SQL 后点 **Run**。结果最多返回 200 行（界面传入上限；插件硬顶 2000）。**Copy SQL** 只复制语句。

示例：

```sql
SELECT * FROM "orders" LIMIT 100;
SELECT count(*) FROM read_parquet('C:/data/lake/orders.parquet');
```

路径写进 SQL 时用正斜杠，单引号内的单引号要写成两个。

## 排错

| 现象 | 处理 |
|------|------|
| 测试失败，找不到驱动或无法打开文件 | 确认 JDK 17+；文件库路径存在，且没有被另一个进程以读写方式锁住 |
| 只读库上建视图失败 | 内存库不受此限制。文件库要注册视图时，取消 **只读** 后重连 |
| Files 列表为空 | **数据目录** 为空，或目录里没有支持的后缀 |
| 视图名和文件名不一样 | 插件会把非法字符换成 `_`。以数字开头的文件名会加前缀 `v_` |
| 大结果被截断 | 在 SQL 里自己写更小的 `LIMIT`，或加过滤条件。界面单次最多取 200 行 |
