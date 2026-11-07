package org.apache.datawise.backend.configstore.jdbc;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.OutboundWebhookEntity;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JdbcOutboundWebhookStoreTest {

    private HikariDataSource dataSource;
    private JdbcOutboundWebhookStore store;

    @BeforeEach
    void setUp() {
        HikariConfig hikari = new HikariConfig();
        hikari.setJdbcUrl("jdbc:h2:mem:jdbc_hook_test_" + System.nanoTime() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1");
        hikari.setUsername("sa");
        hikari.setPassword("");
        dataSource = new HikariDataSource(hikari);
        Flyway.configure()
                .dataSource(dataSource)
                .locations("classpath:db/metadata/migration")
                .load()
                .migrate();
        store = new JdbcOutboundWebhookStore(
                new JdbcTemplate(dataSource),
                new ObjectMapper().findAndRegisterModules());
    }

    @AfterEach
    void tearDown() {
        if (dataSource != null) {
            dataSource.close();
        }
    }

    @Test
    void webhooksAreIsolatedByTenant() {
        OutboundWebhookEntity defaultHook = hook("hook-default", "https://hooks.default.example");
        store.save(TenantIds.DEFAULT, defaultHook);

        OutboundWebhookEntity acmeHook = hook("hook-acme", "https://hooks.acme.example");
        store.save("acme", acmeHook);

        assertEquals(1, store.listByTenantId(TenantIds.DEFAULT).size());
        assertEquals("hook-default", store.listByTenantId(TenantIds.DEFAULT).get(0).getId());
        assertEquals(1, store.listByTenantId("acme").size());
        assertEquals("hook-acme", store.findById("acme", "hook-acme").orElseThrow().getId());

        store.delete("acme", "hook-acme");
        assertTrue(store.listByTenantId("acme").isEmpty());
        assertEquals(1, store.listByTenantId(TenantIds.DEFAULT).size());

        store.replaceAll("acme", List.of(hook("hook-2", "https://hooks.acme.example/2")));
        assertEquals("hook-2", store.listByTenantId("acme").get(0).getId());
    }

    private static OutboundWebhookEntity hook(String id, String url) {
        OutboundWebhookEntity entity = new OutboundWebhookEntity();
        entity.setId(id);
        entity.setName(id);
        entity.setUrl(url);
        entity.setEnabled(true);
        entity.setEventTypes(List.of("audit.appended"));
        entity.setCreatedAt(Instant.now());
        entity.setUpdatedAt(Instant.now());
        return entity;
    }
}
