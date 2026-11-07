package org.apache.datawise.backend.schema.introspect.routines;

import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.schema.SchemaDialectRegistry;
import org.apache.datawise.backend.schema.SchemaScope;
import org.apache.datawise.backend.schema.introspect.JdbcSchemaListingScopes;
import org.apache.datawise.backend.schema.spi.JdbcRoutineLister;
import org.springframework.stereotype.Component;

import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** JDBC {@link DatabaseMetaData#getFunctions()} / {@link DatabaseMetaData#getProcedures()} fallback. */
@Component
public final class JdbcMetadataRoutineLister implements JdbcRoutineLister {

    private final SchemaDialectRegistry dialectRegistry;

    public JdbcMetadataRoutineLister(SchemaDialectRegistry dialectRegistry) {
        this.dialectRegistry = dialectRegistry;
    }

    @Override
    public boolean supports(String dbType) {
        return true;
    }

    @Override
    public int priority() {
        return 1000;
    }

    @Override
    public List<TreeNode> listFunctions(
                                        Connection connection,
                                        String connectionId,
                                        String catalog,
                                        String schema,
                                        String dbType) throws SQLException {
        SchemaScope scope = JdbcSchemaListingScopes.resolveScope(
                connection, catalog, schema, dbType, dialectRegistry);
        if (scope == null) {
            return List.of();
        }
        Set<String> names = new LinkedHashSet<>();
        DatabaseMetaData meta = connection.getMetaData();
        try (ResultSet rs = meta.getFunctions(scope.catalogPattern(), scope.schemaPattern(), "%")) {
            while (rs.next()) {
                String name = resultString(rs, "FUNCTION_NAME", "function_name");
                if (name != null && !name.isBlank()) {
                    names.add(name);
                }
            }
        } catch (SQLException ignored) {
            return List.of();
        }
        return JdbcRoutineListingSupport.toRoutineNodes(
                connectionId, catalog, schema, "function", "fn", names);
    }

    @Override
    public List<TreeNode> listProcedures(
                                         Connection connection,
                                         String connectionId,
                                         String catalog,
                                         String schema,
                                         String dbType) throws SQLException {
        SchemaScope scope = JdbcSchemaListingScopes.resolveScope(
                connection, catalog, schema, dbType, dialectRegistry);
        if (scope == null) {
            return List.of();
        }
        Set<String> names = new LinkedHashSet<>();
        DatabaseMetaData meta = connection.getMetaData();
        try (ResultSet rs = meta.getProcedures(scope.catalogPattern(), scope.schemaPattern(), "%")) {
            while (rs.next()) {
                String name = resultString(rs, "PROCEDURE_NAME", "procedure_name");
                if (name != null && !name.isBlank()) {
                    names.add(name);
                }
            }
        }
        return JdbcRoutineListingSupport.toRoutineNodes(
                connectionId, catalog, schema, "procedure", "proc", names);
    }

    @Override
    public List<TreeNode> listTriggers(
                                       Connection connection,
                                       String connectionId,
                                       String catalog,
                                       String schema,
                                       String dbType) {
        return List.of();
    }

    private static String resultString(ResultSet rs, String... labels) throws SQLException {
        for (String label : labels) {
            try {
                String value = rs.getString(label);
                if (value != null) {
                    return value;
                }
            } catch (SQLException ignored) {
                // try next label
            }
        }
        return null;
    }
}
