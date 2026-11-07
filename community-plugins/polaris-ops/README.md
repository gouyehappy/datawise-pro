# Polaris Ops（社区插件）

PolarIS 运维工作台：命名空间 CRUD、配置新建/更新发布/删除/克隆/历史、服务与实例发现。

- 插件 id：`io.datawise.community.polaris-ops`
- 版本：`0.3.12`
- 栈：Go sidecar（`stdio-jsonl`）+ React（Monaco + gzip 内联 UI）

## 工作台

| Tab | 能力 |
|-----|------|
| Overview | 连接信息、命名空间表、跳转配置/服务 |
| Configs | 命名空间树（新建/删除）+ Monaco 多标签编辑、脏检查、新建/发布/删除/克隆/批量、发布历史 |
| Services | 命名空间筛选 + 服务列表 + 实例表 |

## 打包

```bash
node community-plugins/polaris-ops/package.mjs
node community-plugins/scripts/verify-plugin.mjs community-plugins/polaris-ops
```

产物：`dist/io.datawise.community.polaris-ops-0.3.12-<os-arch>.dwp`

本地安装：社区插件设置中开启「允许未签名开发包」后安装上述路径。
