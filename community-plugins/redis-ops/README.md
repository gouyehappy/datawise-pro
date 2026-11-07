# Redis Ops

独立 Redis 运维台：单实例 / **Sentinel** / **Cluster** / **舰队清单**。

插件 id：`io.datawise.community.redis-ops` · 版本 `0.3.0`

## 打包

```bash
node community-plugins/redis-ops/package.mjs
```

产物：`community-plugins/redis-ops/dist/io.datawise.community.redis-ops-0.3.0.dwp`

## 工作区类型

### Single instance

填 host / port / 可选 ACL username / password / db / TLS。

### Sentinel

1. Workspace = **Sentinel**
2. **Sentinel nodes**：`host:26379,host:26379`
3. **Master name**：如 `mymaster`
4. 可选 **Sentinel password**（连 Sentinel 本身）、Redis **password** / ACL / db / TLS

连接时向 Sentinel 查询当前 master 地址再登录；故障转移后下次操作会重新发现。

### Cluster

1. Workspace = **Cluster**
2. **Cluster nodes**：种子节点 `host:7000,host:7001`
3. 可选 password / ACL / TLS

从种子节点执行 `CLUSTER NODES`，落到一个 master 节点做运维会话。Cluster **不支持 SELECT**（界面隐藏 DB 切换）；Keys/SCAN 为**当前节点视角**（非全集群路由）。多 master 可用 Fleet 清单分别接入。

### Fleet inventory（多实例）

1. 准备 `redis-fleet.yml`（或连接表单点 **使用自带示例舰队文件**）：

```yaml
instances:
  - id: cache-a
    name: Cache A
    host: 10.0.0.1
    port: 6379
    database: 0
    password: ""
    username: ""      # optional ACL
    ssl: false        # optional TLS
    tags: [prod, cache]
  - id: session
    name: Session
    host: 10.0.0.2
    port: 6379
    tags: [prod, session]
```

2. Workspace = **Fleet inventory**，**Inventory YAML** 指到该文件。
3. 打开工作台：顶栏实例下拉 → **全部探测** → 切换实例。

## 模块

| 模块 | 用途 |
|------|------|
| Overview | 内存、命中率、客户端、吞吐、Keys；可 5s/10s 自动刷新；单机/Sentinel 可切换逻辑库 |
| Memory | 压力条、碎片率、大 key 采样 |
| Slowlog | 慢日志，点击复制命令 |
| Clients | 客户端列表；可 CLIENT KILL |
| Replication | 主从角色与 slave 列表 |
| CmdStats | 命令调用 Top |
| Config | `CONFIG GET`；白名单项可 `CONFIG SET`（maxmemory / timeout / slowlog-* 等） |
| Keys | SCAN 分页（50/次）、命名空间、改名/TTL/删除、多选批量 UNLINK；String/Hash/List/Set/ZSet/Stream 可编辑 |
| Console | 终端、常用命令芯片、危险命令闸 |
| Log | 调用日志（独立 tab） |

危险命令（`FLUSH*`、`KEYS`、`SHUTDOWN`、任意非白名单 `CONFIG SET` 等）默认拦截；勾选「允许危险命令」才放行。Config 页白名单 SET 不需开危险闸。

## TLS 说明

开启 TLS 后走 Jedis SSL。信任链使用 JVM 默认 trust store；自签 CA 需自行导入到运行环境，当前不支持在表单里上传证书。
