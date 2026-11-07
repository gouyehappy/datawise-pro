# DataWise Go plugin SDK (vendored)

Framed / JSON-Lines community-plugin SDK adapted from DBX `dbx-plugin-sdk`.
Wire format matches `_private/docs/design/COMMUNITY_PLUGIN.md` (protocol v1).

```go
server := dbxpluginsdk.NewServer(metadata, handler).
    WithTransport(dbxpluginsdk.TransportFramed)
```

Keep stdout reserved for protocol messages. Write diagnostics to stderr.
Use `Emitter.Binary` for plugin→host frames when transport is framed.
