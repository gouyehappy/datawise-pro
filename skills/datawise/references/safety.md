# DataWise safety for agents

Align with `docs/GOVERNANCE.md`:

| Path | Writes |
|------|--------|
| Desktop UI | Danger confirm + production approval when shared prod |
| CLI `sql exec` | Cannot bypass approval / readonly access |
| MCP | Readonly execute; propose tools need UI confirm |
| UI write unlock (`writeGuard`) | **Never** inherited by CLI/MCP |

Do not recommend disabling guards. Prefer `datawise context` over dumping full catalogs into prompts.
