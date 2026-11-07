package org.apache.datawise.backend.ai.federated;

import org.apache.datawise.backend.ai.support.prompt.FederatedSqlPromptTemplates.FederatedSourceSchema;
import org.apache.datawise.backend.model.FederatedViewSource;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertTrue;

class FederatedSqlGeneratorServiceTest {

    @Test
    void mockFederatedSqlReferencesAliases() {
        FederatedViewSource orders = new FederatedViewSource();
        orders.setAlias("orders");
        orders.setConnectionId("c1");
        orders.setDatabase("shop");
        FederatedViewSource users = new FederatedViewSource();
        users.setAlias("users");
        users.setConnectionId("c2");
        users.setDatabase("crm");
        String sql = FederatedSqlGeneratorService.mockFederatedSql(
                "join orders and users",
                List.of(orders, users),
                Map.of(
                        "orders", new FederatedSourceSchema("Shop", "shop", "mysql", List.of("orders"), List.of()),
                        "users", new FederatedSourceSchema("CRM", "crm", "pgsql", List.of("users"), List.of())
                )
        );
        assertTrue(sql.contains("@orders"));
        assertTrue(sql.contains("@users"));
    }
}
