package org.apache.datawise.backend.ai.schema;

import org.apache.datawise.backend.ai.AiException;
import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.schema.SchemaDialect;
import org.apache.datawise.backend.schema.SchemaScope;
import org.springframework.stereotype.Component;

import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * JDBC 元数据读取；经 {@link ConnectorFacade} 访问连接，不直连 {@code JdbcQueryExecutor}。
 */
@Component
public class AiSchemaJdbcMetadata {

    private final ConnectorFacade connectorFacade;

    public AiSchemaJdbcMetadata(ConnectorFacade connectorFacade) {
        this.connectorFacade = connectorFacade;
    }

    public List<String> listTables(ConnectionEntity entity, String database) {
        try {
            return connectorFacade.jdbc().withConnection(entity, database, connection -> {
                SchemaScope scope = resolveScope(entity, connection, database);
                List<String> tables = new ArrayList<>();
                DatabaseMetaData meta = connection.getMetaData();
                try (ResultSet rs = meta.getTables(
                        scope.catalogPattern(),
                        scope.schemaPattern(),
                        "%",
                        new String[]{"TABLE"}
                )) {
                    while (rs.next()) {
                        String tableName = rs.getString("TABLE_NAME");
                        if (tableName != null && !tableName.isBlank()) {
                            tables.add(tableName);
                        }
                    }
                }
                return tables;
            });
        } catch (SQLException ex) {
            throw new AiException(
                    "SCHEMA_LIST_TABLES_FAILED",
                    "Failed to list tables for connection " + entity.getId(),
                    ex
            );
        }
    }

    public List<AiTableRelationHint> loadImportedKeyRelations(
            ConnectionEntity entity,
            String database,
            Set<String> scopeTables
    ) {
        if (scopeTables == null || scopeTables.isEmpty()) {
            return List.of();
        }
        Set<String> normalizedScope = normalizeScopeTables(scopeTables);
        List<AiTableRelationHint> relations = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        try {
            connectorFacade.jdbc().withConnection(entity, database, connection -> {
                SchemaScope scope = resolveScope(entity, connection, database);
                DatabaseMetaData meta = connection.getMetaData();
                try {
                    collectCrossReferences(meta, scope, normalizedScope, relations, seen);
                } catch (SQLException bulkEx) {
                    relations.clear();
                    seen.clear();
                    collectImportedKeysPerTable(meta, scope, normalizedScope, relations, seen);
                }
                return null;
            });
        } catch (SQLException ex) {
            throw new AiException(
                    "SCHEMA_LOAD_RELATIONS_FAILED",
                    "Failed to load table relations for connection " + entity.getId(),
                    ex
            );
        }
        return relations.size() > AiSchemaLimits.MAX_RELATIONS
                ? relations.subList(0, AiSchemaLimits.MAX_RELATIONS)
                : List.copyOf(relations);
    }

    private SchemaScope resolveScope(ConnectionEntity entity, java.sql.Connection connection, String database)
            throws SQLException {
        SchemaDialect dialect = connectorFacade.schema().resolve(entity.getDbType());
        return dialect.resolveScope(connection, database);
    }

    private static Set<String> normalizeScopeTables(Set<String> scopeTables) {
        Set<String> normalized = new HashSet<>(scopeTables.size());
        for (String table : scopeTables) {
            if (table != null && !table.isBlank()) {
                normalized.add(table);
            }
        }
        return normalized;
    }

    /** Single metadata round-trip when the driver supports schema-wide cross references. */
    private static void collectCrossReferences(
            DatabaseMetaData meta,
            SchemaScope scope,
            Set<String> scopeTables,
            List<AiTableRelationHint> relations,
            Set<String> seen
    ) throws SQLException {
        try (ResultSet rs = meta.getCrossReference(
                scope.catalogPattern(),
                scope.schemaPattern(),
                null,
                scope.catalogPattern(),
                scope.schemaPattern(),
                null
        )) {
            while (rs.next()) {
                if (relations.size() >= AiSchemaLimits.MAX_RELATIONS) {
                    return;
                }
                addRelationFromRow(rs, scopeTables, relations, seen);
            }
        }
    }

    /** Fallback for drivers that reject null table patterns in {@link DatabaseMetaData#getCrossReference}. */
    private static void collectImportedKeysPerTable(
            DatabaseMetaData meta,
            SchemaScope scope,
            Set<String> scopeTables,
            List<AiTableRelationHint> relations,
            Set<String> seen
    ) throws SQLException {
        for (String table : scopeTables) {
            if (relations.size() >= AiSchemaLimits.MAX_RELATIONS) {
                return;
            }
            try (ResultSet rs = meta.getImportedKeys(scope.catalogPattern(), scope.schemaPattern(), table)) {
                while (rs.next()) {
                    if (relations.size() >= AiSchemaLimits.MAX_RELATIONS) {
                        return;
                    }
                    addRelationFromRow(rs, scopeTables, relations, seen);
                }
            }
        }
    }

    private static void addRelationFromRow(
            ResultSet rs,
            Set<String> scopeTables,
            List<AiTableRelationHint> relations,
            Set<String> seen
    ) throws SQLException {
        String fkTable = rs.getString("FKTABLE_NAME");
        String fkColumn = rs.getString("FKCOLUMN_NAME");
        String pkTable = rs.getString("PKTABLE_NAME");
        String pkColumn = rs.getString("PKCOLUMN_NAME");
        if (fkTable == null || pkTable == null || fkColumn == null || pkColumn == null) {
            return;
        }
        if (!scopeTables.contains(fkTable) && !scopeTables.contains(pkTable)) {
            return;
        }
        AiTableRelationHint hint = new AiTableRelationHint(fkTable, fkColumn, pkTable, pkColumn);
        if (seen.add(hint.describe())) {
            relations.add(hint);
        }
    }
}
