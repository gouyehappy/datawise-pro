# Kubernetes Manager (DataWise)

[中文](./README.md) | [English](./README.en.md)

**Connect to, inspect, and manage Kubernetes clusters from DataWise**

Ported from [eryajf/dbx-plugin-k8s](https://github.com/eryajf/dbx-plugin-k8s) (Apache-2.0).

## Overview

The DataWise Kubernetes community plugin provides a Kubernetes workbench for everyday operations. After connecting a cluster, you can start with a health overview, browse resources by type, search and inspect objects, and perform common actions from resource details and row menus.

## Build / install

```bash
cd community-plugins/kubernetes
node package.mjs
```

Install the unsigned `.dwp` from `dist/` (Community plugins → allow unsigned development packages).

See [README.md](./README.md) for conversion status and develop commands.
