package org.apache.datawise.backend.configstore.jdbc;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.apache.datawise.backend.configstore.TenantAiUsageStore.AiUsageSnapshot;
import org.apache.datawise.backend.domain.AiMeterCapabilities;
import org.apache.datawise.backend.domain.TenantIds;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

class JdbcTenantAiUsageStoreTest {

    private HikariDataSource dataSource;
    private JdbcTenantAiUsageStore store;

    @BeforeEach
    void setUp() {
        HikariConfig hikari = new HikariConfig();
        hikari.setJdbcUrl("jdbc:h2:mem:jdbc_ai_usage_" + System.nanoTime() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1");
        hikari.setUsername("sa");
        hikari.setPassword("");
        dataSource = new HikariDataSource(hikari);
        Flyway.configure()
                .dataSource(dataSource)
                .locations("classpath:db/metadata/migration")
                .load()
                .migrate();
        store = new JdbcTenantAiUsageStore(new JdbcTemplate(dataSource));
    }

    @AfterEach
    void tearDown() {
        if (dataSource != null) {
            dataSource.close();
        }
    }

    @Test
    void usageIsIsolatedByTenantAndPersists() {
        String today = LocalDate.now(ZoneId.systemDefault()).toString();
        store.write(TenantIds.DEFAULT, new AiUsageSnapshot(today, 3));
        store.write("acme", new AiUsageSnapshot(today, 9));

        assertEquals(3, store.read(TenantIds.DEFAULT).calls);
        assertEquals(9, store.read("acme").calls);
        assertEquals(today, store.read("acme").day);

        store.write("acme", new AiUsageSnapshot(today, 10));
        assertEquals(10, store.read("acme").calls);
        assertEquals(3, store.read(TenantIds.DEFAULT).calls);
    }

    @Test
    void capabilityBreakdownPersists() {
        String today = LocalDate.now(ZoneId.systemDefault()).toString();
        store.write(
                "acme",
                new AiUsageSnapshot(
                        today,
                        2,
                        Map.of(AiMeterCapabilities.CHAT, 1, AiMeterCapabilities.ANALYZE, 1)));
        AiUsageSnapshot read = store.read("acme");
        assertEquals(2, read.calls);
        assertEquals(1, read.byCapability.get(AiMeterCapabilities.CHAT));
        assertEquals(1, read.byCapability.get(AiMeterCapabilities.ANALYZE));
    }
}
