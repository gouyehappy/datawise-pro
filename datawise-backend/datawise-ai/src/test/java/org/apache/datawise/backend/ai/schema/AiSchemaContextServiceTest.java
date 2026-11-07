package org.apache.datawise.backend.ai.schema;

import org.apache.datawise.backend.configstore.SemanticMetricStore;
import org.apache.datawise.backend.ai.tag.AiTableTagService;
import org.apache.datawise.backend.database.context.ConnectionExecutionContext;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.SemanticMetricEntry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AiSchemaContextServiceTest {

    private ConnectionExecutionContext connectionContext;
    private AiSchemaJdbcMetadata jdbcMetadata;
    private AiSchemaDdlLoader ddlLoader;
    private AiTableRelationService tableRelationService;
    private AiTableTagService tableTagService;
    private SemanticMetricStore semanticMetricStore;
    private AiSchemaContextService service;

    @BeforeEach
    void setUp() {
        connectionContext = mock(ConnectionExecutionContext.class);
        jdbcMetadata = mock(AiSchemaJdbcMetadata.class);
        ddlLoader = mock(AiSchemaDdlLoader.class);
        tableRelationService = mock(AiTableRelationService.class);
        tableTagService = mock(AiTableTagService.class);
        semanticMetricStore = mock(SemanticMetricStore.class);

        service = new AiSchemaContextService(
                connectionContext,
                jdbcMetadata,
                ddlLoader,
                tableRelationService,
                tableTagService,
                semanticMetricStore
        );
    }

    @Test
    void buildForTablesFiltersSemanticMetricsBySelectedTablesAndKeepsGlobalMetrics() {
        ConnectionEntity entity = connection("conn-1", "mysql-main", "mysql");
        when(connectionContext.requireAvailableWithDatabaseForCurrentUser("conn-1", "shop", ConnectionExecutionContext.DEFAULT_CONNECTION_NOT_FOUND))
                .thenReturn(new ConnectionExecutionContext.ResolvedConnectionWithDatabase(1L, entity, "shop"));
        when(jdbcMetadata.listTables(entity, "shop")).thenReturn(List.of("orders", "users", "events"));
        when(tableTagService.filterTaggedTables("conn-1", "shop", List.of("orders", "users", "events")))
                .thenReturn(List.of("orders", "users", "events"));
        when(ddlLoader.loadSnippets("conn-1", "shop", List.of("orders"))).thenReturn(List.of());
        when(tableRelationService.loadRelations("conn-1", "shop", List.of("orders"))).thenReturn(List.of());
        when(semanticMetricStore.listScoped("conn-1", "shop")).thenReturn(List.of(
                metric("gmv_orders", List.of("orders")),
                metric("active_users", List.of("users")),
                metric("platform_health", List.of())
        ));

        AiSqlSchemaContext context = service.buildForTables("conn-1", "shop", List.of("orders"), null);

        assertEquals(List.of("orders"), context.tables());
        List<String> metricNames = context.semanticMetrics().stream().map(AiSemanticMetricHint::name).toList();
        assertTrue(metricNames.contains("gmv_orders"));
        assertTrue(metricNames.contains("platform_health"));
        assertFalse(metricNames.contains("active_users"));
    }

    private static ConnectionEntity connection(String id, String name, String dbType) {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setId(id);
        entity.setName(name);
        entity.setDbType(dbType);
        return entity;
    }

    private static SemanticMetricEntry metric(String name, List<String> relatedTables) {
        SemanticMetricEntry entry = new SemanticMetricEntry();
        entry.setName(name);
        entry.setExpression("expr(" + name + ")");
        entry.setRelatedTables(relatedTables);
        return entry;
    }
}
