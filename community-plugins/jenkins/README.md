# Jenkins Ops（社区插件）

按运维日常重做的 Jenkins 工作台：先看健康，再找 Job，一键构建并跟随日志，队列与节点用于排障。

- 插件 id：`io.datawise.community.jenkins`
- 版本：`0.2.3`
- 与一等公民 `datawise-connector-jenkins` **并存**，宿主无特例。

## 工作台怎么用

| 区域 | 用途 |
|------|------|
| **总览** | 排队数 / 忙碌执行器 / 离线节点 / Quiet；收藏捷径、正在构建、失败关注、队列快览 |
| **Jobs** | 左侧 **视图导航**（收藏/所有 + 可搜索列表，可拖宽）；中间 Job 表；右侧详情；三栏均可拖拽 |
| **队列** | 看谁在等、是否阻塞、等待多久；点任务名跳到 Jobs |
| **节点** | 在线/离线筛选 + 负载条 |

收藏存在插件 `storage` 中，换机器需重新钉。

## 连接字段

协议、IP/域名、端口、上下文路径、用户名、API Token/密码、只读、下载目录、跳过 TLS、超时 —— 与配置表单一致。

## 打包

```bash
node community-plugins/jenkins/package.mjs
node community-plugins/scripts/verify-plugin.mjs community-plugins/jenkins
```

产物：`dist/io.datawise.community.jenkins-0.2.3.dwp`

分栏宽度（侧栏 / Jobs 左右栏）与分组偏好会写入插件 `storage`。
