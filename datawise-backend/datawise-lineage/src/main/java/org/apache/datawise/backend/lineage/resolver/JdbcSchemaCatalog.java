package org.apache.datawise.backend.lineage.resolver;

import org.apache.datawise.backend.database.table.TableDetailService;
import org.apache.datawise.backend.domain.TableColumnDetail;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.apache.datawise.backend.lineage.spi.SchemaCatalog;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.Locale;

public class JdbcSchemaCatalog implements SchemaCatalog {

    private static final Logger log = LoggerFactory.getLogger(JdbcSchemaCatalog.class);

    private final TableDetailService tableDetailService;
    private final String connectionId;
    private final String database;

    public JdbcSchemaCatalog(
            TableDetailService tableDetailService,
            String connectionId,
            String database
    ) {
        this.tableDetailService = tableDetailService;
        this.connectionId = connectionId;
        this.database = database;
    }

    @Override
    public List<String> columns(String schema, String table) {
        if (table == null || table.isBlank() || connectionId == null || connectionId.isBlank()) {
            return List.of();
        }
        try {
            String lookupDatabase = schema != null && !schema.isBlank() ? schema : database;
            String relationName = stripSchemaPrefix(schema, table);
            TablePropertiesResult properties = tableDetailService.loadProperties(
                    relationName,
                    connectionId,
                    lookupDatabase
            );
            if (properties == null || properties.columns() == null) {
                return List.of();
            }
            return properties.columns().stream()
                    .map(TableColumnDetail::name)
                    .filter(name -> name != null && !name.isBlank())
                    .toList();
        } catch (Exception ex) {
            log.debug("Failed to load columns for {}.{}: {}", database, table, ex.getMessage());
            return List.of();
        }
    }

    private static String stripSchemaPrefix(String schema, String table) {
        if (schema == null || schema.isBlank()) {
            return table;
        }
        String prefix = schema.toLowerCase(Locale.ROOT) + ".";
        if (table.toLowerCase(Locale.ROOT).startsWith(prefix)) {
            return table.substring(schema.length() + 1);
        }
        return table;
    }
}
