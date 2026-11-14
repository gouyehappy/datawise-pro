# Plugin pack record — 2026-11-12 dark ladder

Reason: UI color-ladder / FOUC fallback adjustments from commit 8a27265.

| # | Plugin | Command | Started | Result | Artifact |
|---|--------|---------|---------|--------|----------|
| 1 | redis-ops | node package.mjs | 14:59:29 | OK 18.9s | io.datawise.community.redis-ops-0.3.0.dwp (3.68 MB) |
| 2 | kafka-ops | node package.mjs | 14:59:48 | OK 8.2s | io.datawise.community.kafka-ops-0.1.11.dwp (18.77 MB) |
| 3 | jenkins | node package.mjs | 14:59:56 | OK 12s | io.datawise.community.jenkins-0.3.27.dwp (2.11 MB) |
| 4 | files-studio | node package.mjs --skip-backend | 15:00:08 | OK 2.8s | io.datawise.community.files-studio-0.1.0-windows-x86_64.dwp (13.98 MB) |
| 5 | log-controller | node package.mjs --skip-backend | 15:00:11 | OK 1s | io.datawise.community.log-controller-0.1.54-windows-x86_64.dwp (5.41 MB) |
| 6 | docker | node package.mjs --skip-backend | 15:00:12 | OK 11s | io.datawise.community.docker-0.1.0-windows-x86_64.dwp (7.04 MB) |
| 7 | kubernetes | node package.mjs --skip-backend | 15:00:23 | OK 22.8s | io.datawise.community.kubernetes-0.1.14-windows-x86_64.dwp (31.1 MB) |
| 8 | nacos-ops | node package.mjs --skip-backend | 15:00:46 | OK 8.4s | io.datawise.community.nacos-ops-0.5.12-windows-x86_64.dwp (6.34 MB) |
| 9 | polaris-ops | node package.mjs --skip-backend | 15:00:54 | OK 9.1s | io.datawise.community.polaris-ops-0.3.12-windows-x86_64.dwp (6.35 MB) |
| 10 | ssh | node package.mjs --skip-backend | 15:01:03 | OK 11.5s | io.datawise.community.ssh-0.7.11-beta.17-windows-x86_64.dwp (20.63 MB) |

Artifacts live under community-plugins/<name>/dist/.
Rust/Go sidecars used --skip-backend (reuse existing binaries); UI rebuilt.

Generated: 2026-11-12T15:01:33
