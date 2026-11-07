package org.apache.datawise.backend.configstore.jdbc;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.ConfigPaths;
import org.apache.datawise.backend.domain.ProjectIds;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.ActiveProjectDocument;
import org.apache.datawise.backend.model.ProjectEntity;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JdbcProjectStoreTest {

    @TempDir
    Path tempDir;

    private HikariDataSource dataSource;
    private JdbcProjectStore store;

    @BeforeEach
    void setUp() {
        HikariConfig hikari = new HikariConfig();
        hikari.setJdbcUrl("jdbc:h2:mem:jdbc_projects_" + System.nanoTime() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1");
        hikari.setUsername("sa");
        hikari.setPassword("");
        dataSource = new HikariDataSource(hikari);
        Flyway.configure()
                .dataSource(dataSource)
                .locations("classpath:db/metadata/migration")
                .load()
                .migrate();
        store = new JdbcProjectStore(new JdbcTemplate(dataSource), new ConfigDirectoryService(tempDir));
    }

    @AfterEach
    void tearDown() {
        if (dataSource != null) {
            dataSource.close();
        }
    }

    @Test
    void ensureDefaultCreatesIndexAndDirs() throws Exception {
        String id = store.ensureDefaultProject(TenantIds.DEFAULT);
        assertEquals(ProjectIds.DEFAULT, id);
        assertTrue(store.findProject(TenantIds.DEFAULT, ProjectIds.DEFAULT).isPresent());
        Path docs = tempDir.resolve(ConfigPaths.tenantProjectDir(TenantIds.DEFAULT, ProjectIds.DEFAULT) + "/docs");
        assertTrue(Files.isDirectory(docs));
        assertEquals(ProjectIds.DEFAULT, store.loadActiveProject(1L, TenantIds.DEFAULT).getProjectId());
    }

    @Test
    void upsertListAndActiveRoundTrip() {
        store.ensureDefaultProject(TenantIds.DEFAULT);
        ProjectEntity extra = new ProjectEntity();
        extra.setId("proj_pay");
        extra.setName("支付中台");
        extra.setColorKey("blue");
        extra.setDescription("pay");
        Instant now = Instant.parse("2026-08-20T08:00:00Z");
        extra.setCreatedAt(now);
        extra.setUpdatedAt(now);
        extra.setArchived(false);
        store.upsertProject(TenantIds.DEFAULT, extra);

        assertEquals(2, store.listProjects(TenantIds.DEFAULT).size());
        store.saveActiveProject(7L, TenantIds.DEFAULT, new ActiveProjectDocument("proj_pay"));
        assertEquals("proj_pay", store.loadActiveProject(7L, TenantIds.DEFAULT).getProjectId());

        store.deleteProject(TenantIds.DEFAULT, "proj_pay");
        assertEquals(1, store.listProjects(TenantIds.DEFAULT).size());
    }
}
