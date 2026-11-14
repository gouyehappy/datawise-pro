package org.apache.datawise.backend.connector.sqlserver.support;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.api.support.TableMetadataSupport;
import org.apache.datawise.backend.domain.TableColumnDetail;
import org.apache.datawise.backend.domain.TableDdlResult;
import org.apache.datawise.backend.domain.TableForeignKeyDetail;
import org.apache.datawise.backend.domain.TableIndexDetail;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.apache.datawise.backend.metadata.spi.TableMetadataIntrospection;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.jdbc.support.SqlServerCatalogSupport;
import org.apache.datawise.backend.jdbc.support.SqlServerMetadataScope;
import org.apache.datawise.backend.schema.SchemaScope;
import org.apache.datawise.backend.schema.TableMetadataLoader;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** SQL Server table/view metadata via information_schema + sys catalog views. */
public class SqlServerTableIntrospector implements TableMetadataIntrospection {

    @Override
    public boolean supports(String dbType) {
        return DbType.isSqlServerFamily(dbType);
    }

    @Override
    public int priority() {
        return 20;
    }

    @Override
    public TablePropertiesResult loadProperties(
            Connection connection,
            ConnectionEntity entity,
            String database,
            String tableName
    ) throws SQLException {
        return loadRelationProperties(connection, entity, database, tableName, false);
    }
    @Override
    public TablePropertiesResult loadViewProperties(
            Connection connection,
            ConnectionEntity entity,
            String database,
            String viewName
    ) throws SQLException {
        return loadRelationProperties(connection, entity, database, viewName, true);
    }
    @Override
    public TableDdlResult loadDdl(
            Connection connection,
            ConnectionEntity entity,
            String database,
            String tableName
    ) throws SQLException {
        return loadRelationDdl(connection, entity, database, tableName, false);
    }
    @Override
    public TableDdlResult loadViewDdl(
            Connection connection,
            ConnectionEntity entity,
            String database,
            String viewName
    ) throws SQLException {
        return loadRelationDdl(connection, entity, database, viewName, true);
    }

    @Override
    public TableDdlResult loadTriggerDdl(
            Connection connection,
            ConnectionEntity entity,
            String database,
            String triggerName
    ) throws SQLException {
        return loadModuleDdl(connection, entity, database, triggerName, "Trigger", "TR");
    }

    @Override
    public TableDdlResult loadFunctionDdl(
            Connection connection,
            ConnectionEntity entity,
            String database,
            String functionName
    ) throws SQLException {
        return loadModuleDdl(connection, entity, database, functionName, "Function", "FN", "IF", "TF", "FS", "FT");
    }

    @Override
    public TableDdlResult loadProcedureDdl(
            Connection connection,
            ConnectionEntity entity,
            String database,
            String procedureName
    ) throws SQLException {
        return loadModuleDdl(connection, entity, database, procedureName, "Procedure", "P", "PC");
    }

    @Override
    public TableDdlResult loadSequenceDdl(
            Connection connection,
            ConnectionEntity entity,
            String database,
            String sequenceName
    ) throws SQLException {
        SqlServerMetadataScope scope = SqlServerCatalogSupport.resolveRelationScope(
                connection,
                database,
                TableMetadataSupport.resolveCatalog(connection, entity, database),
                sequenceName,
                false
        );
        String ddl = loadSequenceDefinition(connection, scope, sequenceName);
        if (ddl == null || ddl.isBlank()) {
            throw new IllegalArgumentException("Sequence not found: " + sequenceName);
        }
        return new TableDdlResult(ddl);
    }

    private String loadSequenceDefinition(
            Connection connection,
            SqlServerMetadataScope scope,
            String sequenceName
    ) throws SQLException {
        StringBuilder sql = new StringBuilder("""
                SELECT
                    'CREATE SEQUENCE ' + QUOTENAME(SCHEMA_NAME(s.schema_id)) + '.' + QUOTENAME(s.name)
                    + ' AS ' + TYPE_NAME(s.system_type_id)
                    + ' START WITH ' + CONVERT(varchar(50), s.start_value)
                    + ' INCREMENT BY ' + CONVERT(varchar(50), s.increment)
                    + ' MINVALUE ' + CONVERT(varchar(50), s.minimum_value)
                    + ' MAXVALUE ' + CONVERT(varchar(50), s.maximum_value)
                    + ' CACHE ' + CONVERT(varchar(50), CASE WHEN s.is_cached = 1 THEN ISNULL(s.cache_size, 0) ELSE 0 END)
                    + CASE WHEN s.is_cycling = 1 THEN ' CYCLE' ELSE ' NO CYCLE' END
                    AS ddl_text
                FROM sys.sequences s
                WHERE s.name = ?
                """);
        if (scope.schema() != null && !scope.schema().isBlank()) {
            sql.append(" AND SCHEMA_NAME(s.schema_id) = ?");
        }
        try (PreparedStatement ps = connection.prepareStatement(sql.toString())) {
            ps.setString(1, sequenceName);
            if (scope.schema() != null && !scope.schema().isBlank()) {
                ps.setString(2, scope.schema());
            }
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    return null;
                }
                return rs.getString("ddl_text");
            }
        }
    }

    private TableDdlResult loadModuleDdl(
            Connection connection,
            ConnectionEntity entity,
            String database,
            String objectName,
            String kindLabel,
            String... objectTypes
    ) throws SQLException {
        SqlServerMetadataScope scope = SqlServerCatalogSupport.resolveRelationScope(
                connection,
                database,
                TableMetadataSupport.resolveCatalog(connection, entity, database),
                objectName,
                false
        );
        String definition = loadModuleDefinition(connection, scope, objectName, objectTypes);
        if (definition == null || definition.isBlank()) {
            throw new IllegalArgumentException(kindLabel + " not found: " + objectName);
        }
        return new TableDdlResult(definition);
    }

    private TableDdlResult loadRelationDdl(
            Connection connection,
            ConnectionEntity entity,
            String database,
            String relationName,
            boolean viewHint
    ) throws SQLException {
        SqlServerMetadataScope scope = SqlServerCatalogSupport.resolveRelationScope(
                connection,
                database,
                TableMetadataSupport.resolveCatalog(connection, entity, database),
                relationName,
                viewHint
        );
        return new TableDdlResult(loadRelationDefinition(connection, scope, relationName));
    }

    private TablePropertiesResult loadRelationProperties(
            Connection connection,
            ConnectionEntity entity,
            String database,
            String relationName,
            boolean view
    ) throws SQLException {
        SqlServerMetadataScope scope = SqlServerCatalogSupport.resolveRelationScope(
                connection,
                database,
                TableMetadataSupport.resolveCatalog(connection, entity, database),
                relationName,
                view
        );
        String catalog = scope.catalog();
        String schema = scope.schema();
        String comment = loadRelationComment(connection, schema, relationName);
        List<TableColumnDetail> columns = loadColumns(connection, catalog, schema, relationName);
        SchemaScope metadataScope = new SchemaScope(catalog, schema, catalog);
        List<TableForeignKeyDetail> foreignKeys = view
                ? List.of()
                : TableMetadataSupport.mapForeignKeys(TableMetadataLoader.loadForeignKeyNodes(
                connection.getMetaData(), "", metadataScope.catalogPattern(), relationName, metadataScope
        ));
        List<TableIndexDetail> indexes = view
                ? List.of()
                : TableMetadataSupport.mapIndexes(TableMetadataLoader.loadIndexNodes(
                connection.getMetaData(), "", metadataScope.catalogPattern(), relationName, metadataScope
        ));
        return new TablePropertiesResult(
                relationName,
                comment,
                null,
                null,
                null,
                null,
                columns,
                foreignKeys,
                indexes
        );
    }

    private List<TableColumnDetail> loadColumns(
            Connection connection,
            String catalog,
            String schema,
            String tableName
    ) throws SQLException {
        List<TableColumnDetail> columns = new ArrayList<>();
        try (PreparedStatement ps = connection.prepareStatement("""
                SELECT c.ORDINAL_POSITION, c.COLUMN_NAME, c.DATA_TYPE, c.IS_NULLABLE,
                       c.COLUMN_DEFAULT, c.CHARACTER_MAXIMUM_LENGTH, c.NUMERIC_PRECISION, c.NUMERIC_SCALE,
                       CAST(ep.value AS NVARCHAR(4000)) AS COLUMN_COMMENT
                FROM INFORMATION_SCHEMA.COLUMNS c
                LEFT JOIN sys.columns sc
                    ON sc.object_id = OBJECT_ID(QUOTENAME(c.TABLE_SCHEMA) + '.' + QUOTENAME(c.TABLE_NAME))
                    AND sc.name = c.COLUMN_NAME
                LEFT JOIN sys.extended_properties ep
                    ON ep.major_id = sc.object_id AND ep.minor_id = sc.column_id AND ep.name = 'MS_Description'
                WHERE c.TABLE_CATALOG = ? AND c.TABLE_SCHEMA = ? AND c.TABLE_NAME = ?
                ORDER BY c.ORDINAL_POSITION
                """)) {
            ps.setString(1, catalog);
            ps.setString(2, schema);
            ps.setString(3, tableName);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    String dataType = formatSqlServerDataType(
                            rs.getString("DATA_TYPE"),
                            rs.getObject("CHARACTER_MAXIMUM_LENGTH"),
                            rs.getObject("NUMERIC_PRECISION"),
                            rs.getObject("NUMERIC_SCALE")
                    );
                    columns.add(new TableColumnDetail(
                            rs.getInt("ORDINAL_POSITION"),
                            rs.getString("COLUMN_NAME"),
                            dataType,
                            "YES".equalsIgnoreCase(rs.getString("IS_NULLABLE")),
                            false,
                            null,
                            TableMetadataSupport.blankToNull(rs.getString("COLUMN_DEFAULT")),
                            null,
                            TableMetadataSupport.blankToNull(rs.getString("COLUMN_COMMENT"))
                    ));
                }
            }
        }
        return columns;
    }

    private String loadRelationComment(Connection connection, String schema, String relationName)
            throws SQLException {
        try (PreparedStatement ps = connection.prepareStatement("""
                SELECT CAST(ep.value AS NVARCHAR(4000)) AS comment_text
                FROM sys.objects o
                INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
                LEFT JOIN sys.extended_properties ep
                    ON ep.major_id = o.object_id AND ep.minor_id = 0 AND ep.name = 'MS_Description'
                WHERE s.name = ? AND o.name = ? AND o.type IN ('U', 'V')
                """)) {
            ps.setString(1, schema);
            ps.setString(2, relationName);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return TableMetadataSupport.blankToNull(rs.getString("comment_text"));
                }
            }
        }
        return null;
    }

    private String loadRelationDefinition(
            Connection connection,
            SqlServerMetadataScope scope,
            String objectName
    ) throws SQLException {
        String ddl = loadDefinitionInSchema(connection, scope, objectName);
        if (ddl != null) {
            return ddl;
        }
        ddl = loadDefinitionInSchema(connection, new SqlServerMetadataScope(scope.catalog(), null), objectName);
        if (ddl != null) {
            return ddl;
        }
        throw new IllegalArgumentException("Object not found: " + scope.qualifiedLabel(objectName));
    }

    private String loadDefinitionInSchema(
            Connection connection,
            SqlServerMetadataScope scope,
            String objectName
    ) throws SQLException {
        String schema = scope.schema();
        if (schema != null && !schema.isBlank()) {
            String viewDefinition = loadInformationSchemaViewDefinition(connection, schema, objectName);
            if (viewDefinition != null) {
                return viewDefinition;
            }
        }
        ObjectMetadata metadata = loadObjectMetadata(connection, scope, objectName);
        if (metadata == null) {
            return null;
        }
        if (metadata.definition() != null && !metadata.definition().isBlank()) {
            return metadata.definition().trim();
        }
        if ("V".equals(metadata.objectType())) {
            String viewDefinition = loadInformationSchemaViewDefinition(connection, metadata.schema(), objectName);
            if (viewDefinition != null) {
                return viewDefinition;
            }
            return loadObjectDefinitionFunction(connection, scope.qualifyObject(objectName));
        }
        if ("U".equals(metadata.objectType())) {
            String ddl = generateCreateTableDdl(connection, scope.catalog(), metadata.schema(), objectName);
            if (ddl != null) {
                return ddl;
            }
        }
        return loadObjectDefinitionFunction(connection, scope.qualifyObject(objectName));
    }

    private ObjectMetadata loadObjectMetadata(
            Connection connection,
            SqlServerMetadataScope scope,
            String objectName
    ) throws SQLException {
        String preferredSchema = scope.schema();
        if (preferredSchema != null && !preferredSchema.isBlank()) {
            ObjectMetadata byId = loadObjectMetadataByObjectId(connection, scope, objectName);
            if (byId != null) {
                return byId;
            }
        }
        // RTRIM: sys.objects.type is char(2) ('U ','V '); JDBC otherwise returns padded values.
        String sql = preferredSchema != null && !preferredSchema.isBlank()
                ? """
                SELECT s.name AS schema_name, RTRIM(o.type) AS object_type, m.definition
                FROM sys.objects o
                INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
                LEFT JOIN sys.sql_modules m ON m.object_id = o.object_id
                WHERE s.name = ? AND o.name = ? AND o.type IN ('U', 'V')
                """
                : """
                SELECT TOP 1 s.name AS schema_name, RTRIM(o.type) AS object_type, m.definition
                FROM sys.objects o
                INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
                LEFT JOIN sys.sql_modules m ON m.object_id = o.object_id
                WHERE o.name = ? AND o.type IN ('U', 'V')
                ORDER BY CASE WHEN s.name = 'dbo' THEN 0 ELSE 1 END, s.name
                """;
        try (PreparedStatement ps = connection.prepareStatement(sql)) {
            int param = 1;
            if (preferredSchema != null && !preferredSchema.isBlank()) {
                ps.setString(param++, preferredSchema);
            }
            ps.setString(param, objectName);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    return null;
                }
                return readObjectMetadata(rs);
            }
        }
    }

    private String loadInformationSchemaViewDefinition(Connection connection, String schema, String viewName)
            throws SQLException {
        try (PreparedStatement ps = connection.prepareStatement("""
                SELECT VIEW_DEFINITION
                FROM INFORMATION_SCHEMA.VIEWS
                WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
                """)) {
            ps.setString(1, schema);
            ps.setString(2, viewName);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    return null;
                }
                String definition = rs.getString("VIEW_DEFINITION");
                return definition != null && !definition.isBlank() ? definition.trim() : null;
            }
        }
    }

    private String loadObjectDefinitionFunction(
            Connection connection,
            String qualifiedObjectName
    ) throws SQLException {
        try (PreparedStatement ps = connection.prepareStatement("SELECT OBJECT_DEFINITION(OBJECT_ID(?))")) {
            ps.setString(1, qualifiedObjectName);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    return null;
                }
                String definition = rs.getString(1);
                return definition != null && !definition.isBlank() ? definition.trim() : null;
            }
        }
    }

    private String loadModuleDefinition(
            Connection connection,
            SqlServerMetadataScope scope,
            String objectName,
            String... objectTypes
    ) throws SQLException {
        if (objectTypes == null || objectTypes.length == 0) {
            return null;
        }
        StringBuilder inList = new StringBuilder();
        for (int i = 0; i < objectTypes.length; i++) {
            if (i > 0) {
                inList.append(',');
            }
            inList.append('?');
        }
        String preferredSchema = scope.schema();
        String sql;
        if (preferredSchema != null && !preferredSchema.isBlank()) {
            sql = """
                    SELECT m.definition
                    FROM sys.objects o
                    INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
                    LEFT JOIN sys.sql_modules m ON m.object_id = o.object_id
                    WHERE s.name = ? AND o.name = ? AND RTRIM(o.type) IN (%s)
                    """.formatted(inList);
        } else {
            sql = """
                    SELECT TOP 1 m.definition
                    FROM sys.objects o
                    INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
                    LEFT JOIN sys.sql_modules m ON m.object_id = o.object_id
                    WHERE o.name = ? AND RTRIM(o.type) IN (%s)
                    ORDER BY CASE WHEN s.name = 'dbo' THEN 0 ELSE 1 END, s.name
                    """.formatted(inList);
        }
        try (PreparedStatement ps = connection.prepareStatement(sql)) {
            int param = 1;
            if (preferredSchema != null && !preferredSchema.isBlank()) {
                ps.setString(param++, preferredSchema);
            }
            ps.setString(param++, objectName);
            for (String type : objectTypes) {
                ps.setString(param++, type);
            }
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    return null;
                }
                String definition = rs.getString(1);
                if (definition != null && !definition.isBlank()) {
                    return definition.trim();
                }
            }
        }
        return loadObjectDefinitionFunction(connection, scope.qualifyObject(objectName));
    }

    private ObjectMetadata loadObjectMetadataByObjectId(
            Connection connection,
            SqlServerMetadataScope scope,
            String objectName
    ) throws SQLException {
        // Catalog already selected via USE; two-part name is more reliable than catalog.schema.object.
        String schema = scope.hasSchema() ? scope.schema() : "dbo";
        String objectIdName = DbType.SQLSERVER.quoteName(schema) + "." + DbType.SQLSERVER.quoteName(objectName);
        try (PreparedStatement ps = connection.prepareStatement("""
                SELECT s.name AS schema_name, RTRIM(o.type) AS object_type, m.definition
                FROM sys.objects o
                INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
                LEFT JOIN sys.sql_modules m ON m.object_id = o.object_id
                WHERE o.object_id = OBJECT_ID(?)
                """)) {
            ps.setString(1, objectIdName);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    return null;
                }
                return readObjectMetadata(rs);
            }
        }
    }

    private static ObjectMetadata readObjectMetadata(ResultSet rs) throws SQLException {
        String type = rs.getString("object_type");
        return new ObjectMetadata(
                rs.getString("schema_name"),
                type != null ? type.trim() : null,
                rs.getString("definition")
        );
    }

    private String generateCreateTableDdl(
            Connection connection,
            String catalog,
            String schema,
            String tableName
    ) throws SQLException {
        List<TableColumnDetail> columns = loadColumns(connection, catalog, schema, tableName);
        if (columns.isEmpty()) {
            return null;
        }
        StringBuilder sb = new StringBuilder();
        sb.append("CREATE TABLE ").append(new SqlServerMetadataScope(catalog, schema).qualifyObject(tableName)).append(" (\n");
        for (int index = 0; index < columns.size(); index++) {
            if (index > 0) {
                sb.append(",\n");
            }
            TableColumnDetail column = columns.get(index);
            sb.append("    ")
                    .append(DbType.SQLSERVER.quoteName(column.name()))
                    .append(' ')
                    .append(column.dataType());
            if (!column.nullable()) {
                sb.append(" NOT NULL");
            }
            if (column.defaultValue() != null && !column.defaultValue().isBlank()) {
                sb.append(" DEFAULT ").append(column.defaultValue().trim());
            }
        }
        sb.append("\n);");
        return sb.toString();
    }

    private static String formatSqlServerDataType(
            String dataType,
            Object charLength,
            Object precision,
            Object scale
    ) {
        if (dataType == null || dataType.isBlank()) {
            return "";
        }
        String normalized = dataType.toLowerCase(Locale.ROOT);
        if (charLength instanceof Number number && number.intValue() > 0
                && (normalized.contains("char") || normalized.contains("binary"))) {
            return dataType + "(" + number.intValue() + ")";
        }
        if (precision instanceof Number prec && prec.intValue() > 0
                && (normalized.contains("decimal") || normalized.contains("numeric"))) {
            int scaleValue = scale instanceof Number scaleNumber ? scaleNumber.intValue() : 0;
            return dataType + "(" + prec.intValue() + "," + scaleValue + ")";
        }
        return dataType;
    }

    private record ObjectMetadata(String schema, String objectType, String definition) {
    }
}
