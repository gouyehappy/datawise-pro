package org.apache.datawise.backend.configstore;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.TeamEntity;
import org.apache.datawise.backend.security.SecretTestSupport;
import org.apache.datawise.backend.security.UserContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TenantPathIsolationTest {

    @TempDir
    Path tempDir;

    private ConfigDirectoryService configDirectory;
    private TeamStore teamStore;
    private ConnectionStore connectionStore;
    private OidcConfigStore oidcConfigStore;

    @BeforeEach
    void setUp() {
        configDirectory = new ConfigDirectoryService(tempDir);
        ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
        teamStore = new FileTeamStore(configDirectory, mapper);
        connectionStore = new FileConnectionStore(configDirectory, mapper, SecretTestSupport.testCodec());
        oidcConfigStore = new FileOidcConfigStore(configDirectory, mapper);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void teamsAndConnections_areIsolatedByTenantPath() throws Exception {
        UserContext.set(1L, false, "s1", TenantIds.DEFAULT);
        TeamEntity defaultTeam = new TeamEntity();
        defaultTeam.setId("team-default");
        defaultTeam.setName("Default Team");
        defaultTeam.setTenantId(TenantIds.DEFAULT);
        defaultTeam.setCreatedAt(Instant.now());
        teamStore.saveTeam(defaultTeam);

        ConnectionEntity defaultConn = new ConnectionEntity();
        defaultConn.setId("conn-default");
        defaultConn.setName("Default Conn");
        defaultConn.setTenantId(TenantIds.DEFAULT);
        defaultConn.setUserId(1L);
        defaultConn.setGroupId("group-default");
        defaultConn.setDbType("mysql");
        var defaultGroup = new org.apache.datawise.backend.model.ConnectionGroupEntity();
        defaultGroup.setId("group-default");
        defaultGroup.setLabel("Default");
        defaultGroup.setTenantId(TenantIds.DEFAULT);
        defaultGroup.setUserId(1L);
        defaultGroup.setSortOrder(0);
        connectionStore.saveGroup(defaultGroup);
        connectionStore.saveConnection(defaultConn);

        UserContext.set(1L, false, "s1", "acme");
        teamStore.ensureTenantFiles("acme");
        connectionStore.ensureTenantFiles("acme");
        TeamEntity acmeTeam = new TeamEntity();
        acmeTeam.setId("team-acme");
        acmeTeam.setName("Acme Team");
        acmeTeam.setTenantId("acme");
        acmeTeam.setCreatedAt(Instant.now());
        teamStore.saveTeam(acmeTeam);

        var acmeGroup = new org.apache.datawise.backend.model.ConnectionGroupEntity();
        acmeGroup.setId("group-acme");
        acmeGroup.setLabel("Acme");
        acmeGroup.setTenantId("acme");
        acmeGroup.setUserId(1L);
        acmeGroup.setSortOrder(0);
        connectionStore.saveGroup(acmeGroup);

        ConnectionEntity acmeConn = new ConnectionEntity();
        acmeConn.setId("conn-acme");
        acmeConn.setName("Acme Conn");
        acmeConn.setTenantId("acme");
        acmeConn.setUserId(1L);
        acmeConn.setGroupId("group-acme");
        acmeConn.setDbType("mysql");
        connectionStore.saveConnection(acmeConn);

        assertEquals(1, teamStore.listAllTeams().size());
        assertEquals("team-acme", teamStore.listAllTeams().get(0).getId());
        assertEquals(1, connectionStore.findAllConnections().size());
        assertEquals("conn-acme", connectionStore.findAllConnections().get(0).getId());

        UserContext.set(1L, false, "s1", TenantIds.DEFAULT);
        assertEquals(1, teamStore.listAllTeams().size());
        assertEquals("team-default", teamStore.listAllTeams().get(0).getId());
        assertEquals(1, connectionStore.findAllConnections().size());
        assertEquals("conn-default", connectionStore.findAllConnections().get(0).getId());

        assertTrue(Files.isRegularFile(configDirectory.resolve(ConfigPaths.tenantTeams(TenantIds.DEFAULT))));
        assertTrue(Files.isRegularFile(configDirectory.resolve(ConfigPaths.tenantTeams("acme"))));
        assertTrue(Files.isRegularFile(configDirectory.resolve(ConfigPaths.tenantConnections(TenantIds.DEFAULT))));
        assertTrue(Files.isRegularFile(configDirectory.resolve(ConfigPaths.tenantConnections("acme"))));
    }

    @Test
    void oidc_isIsolatedByTenantPath() {
        UserContext.set(1L, false, "s1", TenantIds.DEFAULT);
        var defaultCfg = OidcConfigStore.StoredOidcConfig.disabledDefaults();
        defaultCfg.frontendRedirectBase = "https://default.example";
        oidcConfigStore.save(defaultCfg);

        UserContext.set(1L, false, "s1", "acme");
        oidcConfigStore.ensureTenantFiles("acme");
        var acmeCfg = OidcConfigStore.StoredOidcConfig.disabledDefaults();
        acmeCfg.frontendRedirectBase = "https://acme.example";
        oidcConfigStore.save(acmeCfg);

        assertEquals("https://acme.example", oidcConfigStore.current().frontendRedirectBase);

        UserContext.set(1L, false, "s1", TenantIds.DEFAULT);
        assertEquals("https://default.example", oidcConfigStore.current().frontendRedirectBase);

        UserContext.clear();
        assertEquals("https://default.example", oidcConfigStore.current().frontendRedirectBase);
    }

    @Test
    void nonDefaultTenant_doesNotMigrateRootLegacy() throws Exception {
        Files.writeString(configDirectory.resolve(ConfigPaths.TEAMS), "{\"teams\":[]}");
        UserContext.set(1L, false, "s1", "acme");
        TenantScopedConfigSupport.ensureCurrentTeamsPath(configDirectory);
        assertTrue(Files.isRegularFile(configDirectory.resolve(ConfigPaths.TEAMS)));
        assertFalse(Files.exists(configDirectory.resolve(ConfigPaths.TEAMS + ".migrated")));
    }
}
