# dbt 项目

把本机 [dbt](https://www.getdbt.com/) 项目接进 DataWise：列出 model、编译或运行，再把编译后的 SQL 打开到已有的 SQL 控制台。仓库密码留在宿主里，插件看不到。

插件 id：`io.datawise.community.dbt` · 版本 `0.3.0` · 需要 Host API `^1.5` 与权限 `host.sql`。

## 作用

分析工程师不必在终端和客户端之间来回切。这个插件只负责 dbt 项目本身（`dbt compile` / `dbt run`）。对仓库真正执行 SQL，仍然用 DataWise 里已经建好的连接。

## 准备

- 已重启过带 Host API 1.5 的 DataWise 后端
- 本机 `PATH` 上有 JDK 17+（宿主用 `java -jar` 拉起 sidecar）
- 本机能运行 `dbt --version`（或在连接里填写 dbt 可执行文件的完整路径）
- 项目目录里有 `dbt_project.yml`
- 若要把编译 SQL 送到控制台：DataWise 里已经有一条可访问仓库的 SQL 连接

## 安装

在仓库根目录打包（已打好可跳过）：

```bash
node community-plugins/dbt/package.mjs
```

产物：`community-plugins/dbt/dist/io.datawise.community.dbt-0.3.0.dwp`

1. 打开 **社区插件**。
2. 设置里打开 **允许未签名开发包**。
3. 安装上面的 `.dwp`（粘贴绝对路径或拖入）。

## 操作

1. **新建连接** → 分类 **Plugins** → **dbt 项目**。
2. 还没有 dbt 项目时，点 **Use bundled demo project**。表单会填入插件自带的示例目录（`stg_customers`、`customers`）。有自己的项目时，把 **项目路径** 指到含 `dbt_project.yml` 的文件夹。
3. 填写其余项：
   - **项目路径**：例如 `C:\work\my_dbt_project`
   - **Target**：与 `profiles.yml` 里的 target 一致，默认 `dev`
   - **profiles 目录**：不用默认 `~/.dbt` 时再填
   - **dbt 可执行文件**：不在 `PATH` 上时填完整路径
4. 测试连接。目录合法即可通过。本机没有 `dbt` 时会带警告：仍可浏览 model 源文件；Compile / Test / Run 保持禁用。
5. 保存后打开 **dbt 工作台**。
6. 点 **Refresh models**。有 dbt 时走 `dbt ls`，否则扫描 `models/**/*.sql`。空列表时左侧会说明原因。
7. 点一个 model：先显示源 SQL，以及 `ref()` 上下游。
8. 主路径：**Compile** → 选已有 DataWise 连接 → **Open in SQL console**（只填 SQL，不自动执行）。
9. 可选：**Test** / **Build**；**Run…** 会写仓库，点击前确认。

## 排错

| 现象 | 处理 |
|------|------|
| 测试连接报找不到 `dbt_project.yml` | 项目路径要指到含该文件的目录，不要指到 `models/` |
| 测试连接报 dbt binary failed | 在同一台机器的终端先跑通 `dbt --version`，或把连接里的可执行文件改成绝对路径 |
| 模型列表为空 | 确认 `models/` 下有 `.sql`；若只要 CLI 列表，先在项目里能成功 `dbt ls` |
| Compile 没有 SQL | 看输出里的 stderr。常见原因是 target / profiles 不对，或该 model 依赖未安装的包 |
| 打开控制台按钮是灰的 | 先 Compile 出 SQL，并在下拉框里选中一条 SQL 连接 |
| 提示需要 `host.sql` | 安装的是旧包，或后端还不是 Host API 1.5。重新安装 `0.3.0` 的 `.dwp` 并重启后端 |
| 左侧有黄色说明 | 按说明改项目路径，或在连接表单使用示例项目 |
| Compile / Run 是灰的 | 本机没有 dbt。装好后刷新；浏览源 SQL 不需要 dbt |
| 表右键「在 dbt 中查找」没找到 | 先打开一次该 dbt 项目的工作台，再在表上右键。名字需与 model 名一致 |

工作台里还可以：按 selector 过滤（如 `customers`、`tag:nightly`）、看 `ref()` 上下游、对选中对象执行 Test / Build。**Run** 会写仓库，点击前会确认。命令日志里若存在 `target/run_results.json`，会附上成功/失败条数。

资源树的表或视图右键 **在 dbt 中查找** 会在已打开的 dbt 项目里按表名找 model。宿主 MCP 目录不会转发插件方法；工作台状态里的 `dbt/tools` 列出了可供调用的 RPC 名。
