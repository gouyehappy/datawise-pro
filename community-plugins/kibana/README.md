# Kibana Logs (community plugin)

Discover-style log workbench for DataWise, modeled after **Kibana / OpenSearch Dashboards Discover** (classic layout + `@elastic/eui`), talking to Elasticsearch through a Go sidecar — same idea as the Kubernetes community plugin (port the open-source UI patterns, not iframe the remote product).

## Connection fields

| Field | Example |
|-------|---------|
| Host / URL | `https://kibana.example.com` |
| Port | `443` |
| HTTPS | on |
| Kibana base path | `/kibana` |
| Kibana space | `default` |
| Username / password | Kibana login |
| Default index pattern | `logs-*` |

## Build

```bash
node community-plugins/kibana/package.mjs
# or skip pieces:
node community-plugins/kibana/package.mjs --skip-backend
node community-plugins/kibana/package.mjs --skip-frontend
```

Output:

```text
community-plugins/kibana/dist/io.datawise.community.kibana-0.3.0-<os-arch>.dwp
```

Frontend source lives in `frontend/` (React + Vite + EUI). Packaged assets are written to `ui/`.

## UI

Discover layout adapted from [OpenSearch Dashboards Discover](https://github.com/opensearch-project/OpenSearch-Dashboards/tree/main/src/plugins/discover) (Apache-2.0): classic hits chrome, Filters + time row, sidebar index/fields, histogram, and `dl.source` doc table with truncate-by-height.

Data RPCs: `kibana/indices`, `kibana/search`, `kibana/doc`.

> Full OSD Discover cannot be vendored as a standalone app (it depends on the Dashboards platform). This plugin ports the visible patterns + EUI, wired to the DataWise sidecar.
