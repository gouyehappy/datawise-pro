# datawise-plugin-sdk

Rust SDK for the DataWise community-plugin sidecar protocol (framed / JSONL).

Provides:

- `plugin/initialize` negotiation
- concurrent JSON-RPC dispatch
- events + binary channels (framed)
- bounded message sizes

```rust
use datawise_plugin_sdk::{
    PluginEmitter, PluginError, PluginHandler, PluginMetadata, PluginServer,
    RequestContext,
};
```

See `_private/docs/design/COMMUNITY_PLUGIN.md#platform` in the DataWise repo.
