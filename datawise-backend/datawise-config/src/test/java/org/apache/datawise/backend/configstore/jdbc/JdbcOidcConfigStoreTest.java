package org.apache.datawise.backend.configstore.jdbc;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.apache.datawise.backend.configstore.OidcConfigStore.StoredOidcConfig;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.security.UserContext;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JdbcOidcConfigStoreTest {

    private HikariDataSource dataSource;
    private JdbcOidcConfigStore store;

    @BeforeEach
    void setUp() {
        HikariConfig hikari = new HikariConfig();
        hikari.setJdbcUrl("jdbc:h2:mem:jdbc_oidc_test_" + System.nanoTime() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1");
        hikari.setUsername("sa");
        hikari.setPassword("");
        dataSource = new HikariDataSource(hikari);
        Flyway.configure()
                .dataSource(dataSource)
                .locations("classpath:db/metadata/migration")
                .load()
                .migrate();
        store = new JdbcOidcConfigStore(new JdbcTemplate(dataSource), new ObjectMapper().findAndRegisterModules());
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
        if (dataSource != null) {
            dataSource.close();
        }
    }

    @Test
    void oidcConfigIsIsolatedByTenant() {
        UserContext.set(1L, false, "s1", TenantIds.DEFAULT);
        StoredOidcConfig defaultCfg = StoredOidcConfig.disabledDefaults();
        defaultCfg.issuer = "https://idp.default.example";
        defaultCfg.clientId = "default-client";
        defaultCfg.redirectUri = "http://localhost/callback";
        defaultCfg.enabled = true;
        store.save(defaultCfg);

        UserContext.set(1L, false, "s1", "acme");
        store.ensureTenantFiles("acme");
        StoredOidcConfig acmeCfg = StoredOidcConfig.disabledDefaults();
        acmeCfg.issuer = "https://idp.acme.example";
        acmeCfg.clientId = "acme-client";
        acmeCfg.redirectUri = "http://localhost/acme/callback";
        acmeCfg.enabled = true;
        store.save(acmeCfg);

        assertEquals("https://idp.acme.example", store.current().issuer);
        assertEquals("acme-client", store.current().clientId);

        UserContext.set(1L, false, "s1", TenantIds.DEFAULT);
        assertEquals("https://idp.default.example", store.current().issuer);
        assertTrue(store.current().enabled);
        assertFalse(store.saveForTenant("other", StoredOidcConfig.disabledDefaults()).enabled);
    }
}
