# DataWise Agent Skill

Use DataWise CLI / MCP to explore databases under the same governance as the desktop app.

## When to use

- Need schema context for SQL or migration work
- User already has connections configured in DataWise
- Prefer governed access over ad-hoc JDBC scripts

## Hard rules

1. List connections first: `datawise sql connections` (or MCP equivalent).
2. Prefer `datawise context <connection> [--tables a,b] [--max-tables 8]` for token-efficient schema.
3. Default to read-only exploration. Do **not** add write flags or invent production writes.
4. Shared production writes require team approval — never bypass DataWise.
5. Do not suggest connecting around DataWise with raw drivers to the same production host unless the user explicitly accepts that risk.

## Workflow

1. `datawise sql connections --json`
2. `datawise context <name-or-id> --database <db> --json`
3. Optional readonly SQL via MCP / desk UI
4. For writes: draft SQL → user confirms in DataWise (danger bar / production approval)

## Safety

See `references/safety.md`.

## More

- Workflows: `references/workflows.md`
- Examples: `examples/context-mysql.md`
