# datawise_dbt_sample

本地 DuckDB 测试用 dbt 项目，给 DataWise 社区插件联调。

## 结构

| 路径 | 内容 |
|------|------|
| `seeds/` | `raw_customers`、`raw_orders` CSV |
| `models/staging/` | `stg_customers`、`stg_orders` |
| `models/marts/` | `customers`（活跃客户汇总）、`customer_orders` |
| `tests/` | 自定义断言 |
| `profiles.yml` | DuckDB 文件库 `datawise_dbt_sample.duckdb` |

## 命令行（可选）

```powershell
pip install dbt-duckdb
cd testdata\dbt-sample
dbt seed --profiles-dir .
dbt run --profiles-dir .
dbt test --profiles-dir .
dbt compile --profiles-dir . --select customers
```

## 接到 DataWise dbt 插件

1. 新建连接 → Plugins → **dbt 项目**
2. **项目路径**：`E:\phenixanworkspaces\datawise-cli\testdata\dbt-sample`
3. **profiles 目录**：同上（本目录里的 `profiles.yml`）
4. **Target**：`dev`
5. **dbt 可执行文件**：若 `dbt` 不在 PATH，填 `python -m dbt` 不行；用 `where.exe dbt` 找到的绝对路径（Windows 上常在 Python `Scripts\dbt.exe`）
6. 测试连接 → 打开工作台 → Refresh models

Compile 后可用 DataWise 里已有的 DuckDB / SQL 连接打开编译 SQL；本项目仓库文件是同目录下的 `datawise_dbt_sample.duckdb`（首次 `dbt seed`/`run` 后生成）。
