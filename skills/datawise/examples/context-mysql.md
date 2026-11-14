# Example: compact MySQL context

```bash
datawise --token "$DATAWISE_API_TOKEN" context shop-db --database shop --tables users,orders --json
```

Expected shape (abbreviated):

```json
{
  "connectionId": "…",
  "dbType": "mysql",
  "database": "shop",
  "tables": [
    {"name": "users", "columns": [{"name": "id", "type": "bigint"}, {"name": "email", "type": "varchar"}]}
  ]
}
```

Use only listed tables/columns when drafting SQL.
