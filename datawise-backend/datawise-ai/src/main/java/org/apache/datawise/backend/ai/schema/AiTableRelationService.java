package org.apache.datawise.backend.ai.schema;

import org.apache.datawise.backend.ai.AiException;
import org.apache.datawise.backend.database.context.ConnectionExecutionContext;
import org.apache.datawise.backend.database.context.ConnectionExecutionContext.ResolvedConnectionWithDatabase;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@Service
public class AiTableRelationService {

    private static final Logger log = LoggerFactory.getLogger(AiTableRelationService.class);

    private final ConnectionExecutionContext connectionContext;
    private final AiSchemaJdbcMetadata jdbcMetadata;

    public AiTableRelationService(
            ConnectionExecutionContext connectionContext,
            AiSchemaJdbcMetadata jdbcMetadata
    ) {
        this.connectionContext = connectionContext;
        this.jdbcMetadata = jdbcMetadata;
    }

    public List<AiTableRelationHint> loadRelations(
            String connectionId,
            String database,
            List<String> tableNames
    ) {
        if (connectionId == null || connectionId.isBlank() || tableNames == null || tableNames.isEmpty()) {
            return List.of();
        }
        Set<String> scopeTables = normalizeTableNames(tableNames);
        if (scopeTables.isEmpty()) {
            return List.of();
        }
        try {
            ResolvedConnectionWithDatabase resolved = connectionContext.requireAvailableWithDatabaseForCurrentUser(
                    connectionId,
                    database,
                    ConnectionExecutionContext.DEFAULT_CONNECTION_NOT_FOUND
            );
            return jdbcMetadata.loadImportedKeyRelations(
                    resolved.entity(),
                    resolved.database(),
                    scopeTables
            );
        } catch (AiException ex) {
            log.debug("Skip table relations for connectionId={}: {}", connectionId, ex.getMessage());
            return List.of();
        }
    }

    private static Set<String> normalizeTableNames(List<String> tableNames) {
        Set<String> scopeTables = new LinkedHashSet<>();
        for (String table : tableNames) {
            if (table != null && !table.isBlank()) {
                scopeTables.add(table.trim());
            }
        }
        return scopeTables;
    }
}
