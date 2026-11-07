# Kafka Ops

Kafka 运维工作台：按**流**域组织（Pulse / Topics / Explore / Lag / Brokers / Guard），不是 Redis Ops 的 Tab 翻版。

插件 id：`io.datawise.community.kafka-ops` · 版本 `0.1.11`

## 打包

```bash
node community-plugins/kafka-ops/package.mjs
```

产物：`community-plugins/kafka-ops/dist/io.datawise.community.kafka-ops-0.1.11.dwp`

## 工作区类型

### Bootstrap cluster

填 `bootstrap.servers`、安全协议（PLAINTEXT / SSL / SASL_*）、可选 SASL 用户名密码、clientId。

### Fleet inventory（多集群）

1. 准备 `kafka-fleet.yml`（或连接表单点 **使用自带示例舰队文件**）：

```yaml
clusters:
  - id: local
    name: Local Kafka
    bootstrapServers: 127.0.0.1:9092
    securityProtocol: PLAINTEXT
    tags: [dev]
```

2. Workspace = **Fleet inventory**，Inventory YAML 指到该文件。
3. 顶栏集群下拉 → **全部探测** → 切换集群。

## 工作台（Kafka 原生 IA）

| 区域 | 用途 |
|------|------|
| **Pulse** | 集群体检首页：中文健康结论 + URP/Offline 释义 + 规模指标 + 异常 Topic 下钻 |
| **Topics** | 命名空间折叠、防抖过滤；详情秒开（关联消费组异步）；白名单配置 SET 需确认 |
| **Explore** | 顶栏 Offset 摘要 + Records / 详情双栏；列表突出 offset / 时间 / 类型提示；自动 unwrap `fromJson` 等嵌套 JSON；↑↓ 切换记录 |
| **Lag** | 顶栏摘要；组卡片按问题优先；详情为 Topic 主从下钻（过滤 / 仅积压）+ 成员 Tab |
| **Brokers** | 节点摘要 + Leader 分布条 + 卡片（Controller / 倾斜标黄 / rack 过滤） |
| **审计** | 危险模式状态条 + 门禁/白名单卡片；调用日志可过滤（失败/写操作）与搜索 |

危险写操作（删 Topic、Produce、重置 Offset、删组、非白名单配置）默认拦截；顶栏开启「危险模式」并经 UI 确认后放行。

Topic 配置白名单（无需危险模式）：`retention.ms`、`retention.bytes`、`max.message.bytes`、`compression.type`、`cleanup.policy`、`min.insync.replicas`、`unclean.leader.election.enable`、`message.timestamp.type`、`segment.ms`、`segment.bytes`。

## 技术说明

- Sidecar：`kafka-clients` AdminClient + 短生命周期 Consumer（`assign`，不加入业务消费组）/ Producer
- 消息拉取单次上限 100 条、value 预览截断 8KB
- TLS 信任链走 JVM 默认 trust store；表单暂不支持上传自定义 CA
- 后期可扩展：Schema Registry、Connect、ACL、分区重分配（不进 0.1.0）

## TLS / SASL

- `SSL` / `SASL_SSL`：依赖运行环境 trust store
- `SASL_PLAINTEXT` / `SASL_SSL` + PLAIN / SCRAM-SHA-256 / SCRAM-SHA-512：用户名走插件字段（避免 host JDBC `user` 污染）
