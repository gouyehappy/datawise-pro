# DataWise Agent workflows

## Explore schema

1. `datawise sql connections --json`
2. Pick a connection id or unique name.
3. `datawise context <ref> --database <db> --max-tables 8 --json`
4. Answer the user from the packet; do not invent columns.

## Draft SQL safely

1. Prefer Ask / explain first when the user is exploring.
2. Put SQL into DataWise console for the **bound** connection — never a different Tab focus.
3. For writes: user confirms exact SQL in DataWise (danger bar / production approval). Do not silent-execute.

## Migration with honesty

1. Use desktop migration wizard or `datawise migrate run …`.
2. With `--create-missing`, read `structureDeployAtomicity` in the report.
3. If `partial_effects_possible`, warn that DDL may partially apply (e.g. MySQL) and require a recovery plan.

## Install / refresh this Skill

```bash
datawise agent setup
datawise agent doctor
```
