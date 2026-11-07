package org.apache.datawise.backend.connector.kylin.schema;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.kylin.support.KylinMetadataSupport;
import org.apache.datawise.backend.schema.SchemaDialect;
import org.apache.datawise.backend.schema.SchemaScope;

import java.sql.Connection;
import java.sql.SQLException;

/** Kylin Explorer: one project node with OLAP tables/cubes underneath. */
public class KylinSchemaDialect implements SchemaDialect {

    @Override
    public String id() {
        return DbType.KYLIN.id();
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.KYLIN.matches(dbType);
    }

    @Override
    public SchemaScope resolveScope(Connection connection, String catalogLabel) throws SQLException {
        String project = catalogLabel != null && !catalogLabel.isBlank()
                ? catalogLabel.trim()
                : KylinMetadataSupport.resolveProject(connection);
        return new SchemaScope(project, null, project);
    }

    @Override
    public boolean isSystemCatalog(String catalog) {
        return catalog == null || catalog.isBlank();
    }
}
