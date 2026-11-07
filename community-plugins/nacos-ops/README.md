# Nacos Ops（社区插件）

Nacos / rNacos 运维工作台：命名空间 CRUD、配置读写/新建/发布/删除/历史、AK/SK 认证、服务与实例发现。

- 插件 id：`io.datawise.community.nacos-ops`
- 版本：`0.5.12`
- 栈：Go sidecar（`stdio-jsonl`）+ React（Monaco + gzip 内联 UI）
- 与一等公民 `datawise-connector-nacos` **并存**，宿主无特例

## 工作台

| Tab | 能力 |
|-----|------|
| Overview | 连接信息、命名空间表、跳转配置/服务 |
| Configs | 命名空间树（新建/删除）+ Monaco 多标签编辑、脏检查、新建/发布/删除/克隆/批量、配置历史恢复 |
| Services | 命名空间下拉 + 服务列表 + 实例表 |

## 连接认证

- `password`：用户名/密码登录（或匿名）
- `access_key`：AccessKey / SecretKey（Spas 签名头）

## 打包

```bash
node community-plugins/nacos-ops/package.mjs
node community-plugins/scripts/verify-plugin.mjs community-plugins/nacos-ops
```

产物：`dist/io.datawise.community.nacos-ops-0.5.12-<os-arch>.dwp`

本地安装：社区插件设置中开启「允许未签名开发包」后安装上述路径。
