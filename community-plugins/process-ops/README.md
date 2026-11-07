# Process Ops

Multi-host process and resource workbench for DataWise Community Plugins.

- Default **localhost** after creating a workspace connection
- Left rail: host inventory; **bastion (jump)** → service hosts (ProxyJump); discover/import from bastion
- Tabs: Overview · Processes · Services (systemd / Windows) · Diagnose · Console (one-shot exec + log peek)

## Develop

```bash
cd community-plugins/process-ops
npm install
npm run build
cd backend && go build -o datawise-plugin-process-ops.exe .
cd ..
node package.mjs
```

Install the unsigned `.dwp` from `dist/` with “allow unsigned packages” enabled.

## Stack

Go sidecar (`stdio-jsonl` + vendored SDK) · Vue 3 · gopsutil · golang.org/x/crypto/ssh
