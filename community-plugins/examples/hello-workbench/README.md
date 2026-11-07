# Hello Workbench (community plugin example)

Minimal plugin that implements the DataWise community protocol:

- Protocol: [`_private/docs/design/COMMUNITY_PLUGIN.md#platform`](../../../_private/docs/design/COMMUNITY_PLUGIN.md#platform)
- How to build: [`_private/docs/design/COMMUNITY_PLUGIN.md#implementation`](../../../_private/docs/design/COMMUNITY_PLUGIN.md#implementation)

Contribution points covered:

- `connection-provider`
- `workbench` (sandboxed UI + `window.datawisePlugin`)
- `filesystem-provider` (`hello:/`, not `sessionBound`)

## Package

From the repository root:

```bash
# Unsigned (dev)
node community-plugins/examples/hello-workbench/package.mjs

# Or via CLI (Java DwpPackageTool)
npm run plugin:package -- community-plugins/examples/hello-workbench
```

Signed package:

```bash
npm run plugin:keygen -- datawise-examples
# Add the printed publicKeyBase64 under Community plugins → Settings → Trust keys
npm run plugin:package -- community-plugins/examples/hello-workbench \
  --sign-key-id datawise-examples \
  --sign-private-key-b64 <privateKeyBase64>
```

Output:

```text
community-plugins/examples/hello-workbench/dist/io.datawise.example.hello-1.0.0.dwp
```

## Install

1. Open **Community plugins** from the title-bar menu.
2. Settings → enable **Allow unsigned development packages** (unsigned only).
3. Paste the absolute path to the `.dwp` and install, or drop the file.
4. Installed → open workbench / browse files / new connection.
5. New connection → category **Plugins** → Hello connection.

Requires a JDK on `PATH` so the host can `java -jar bin/hello-plugin.jar`.
