package org.apache.datawise.backend.service.portability;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.configstore.AppConfigStore;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.ConnectionStore;
import org.apache.datawise.backend.configstore.FileConnectionStore;
import org.apache.datawise.backend.configstore.FileProjectStore;
import org.apache.datawise.backend.configstore.FileSqlHistoryStore;
import org.apache.datawise.backend.configstore.UserAppConfigStore;
import org.apache.datawise.backend.configstore.WorkspaceStore;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.ConnectionGroupEntity;
import org.apache.datawise.backend.security.SecretTestSupport;
import org.apache.datawise.backend.security.SecretValueCodec;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.UserAccessPolicy;
import org.apache.datawise.backend.service.UserResourcePolicy;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ProfilePortabilityServiceTest {

    @TempDir
    Path tempDir;

    private ProfilePortabilityService service;
    private ConnectionStore connectionStore;
    private UserAppConfigStore userAppConfigStore;
    private SecretValueCodec codecA;
    private SecretValueCodec codecB;

    @BeforeEach
    void setUp() {
        codecA = SecretTestSupport.testCodec();
        ObjectMapper mapper = new ObjectMapper();
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(tempDir);
        connectionStore = new FileConnectionStore(configDirectory, mapper, codecA);
        AppConfigStore appConfigStore = new AppConfigStore(configDirectory, mapper, codecA);
        userAppConfigStore = new UserAppConfigStore(configDirectory, appConfigStore, mapper, codecA);
        UserAccessPolicy accessPolicy = new UserAccessPolicy();
        UserResourcePolicy resourcePolicy = new UserResourcePolicy(accessPolicy);
        FileProjectStore projectStore = new FileProjectStore(configDirectory, mapper);
        WorkspaceStore workspaceStore = new WorkspaceStore(
                new FileSqlHistoryStore(configDirectory, mapper),
                configDirectory,
                mapper);
        service = new ProfilePortabilityService(
                connectionStore,
                userAppConfigStore,
                appConfigStore,
                configDirectory,
                codecA,
                mapper,
                accessPolicy,
                resourcePolicy,
                projectStore,
                null,
                workspaceStore,
                null,
                null,
                null,
                null,
                null,
                null);
        UserContext.set(1L, false, "session-test", "default");
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void exportImportRoundTripWithDifferentMasterKey() throws Exception {
        ConnectionGroupEntity group = new ConnectionGroupEntity();
        group.setId("g1");
        group.setLabel("Default");
        group.setSortOrder(0);
        group.setExpanded(true);
        connectionStore.saveGroup(group);

        ConnectionEntity connection = new ConnectionEntity();
        connection.setId("c1");
        connection.setGroupId("g1");
        connection.setName("Local MySQL");
        connection.setDbType("mysql");
        connection.setHost("127.0.0.1");
        connection.setPort("3306");
        connection.setPassword("db-password");
        connectionStore.saveConnection(connection);

        Map<String, Object> app = Map.of("theme", Map.of("mode", "dark"));
        userAppConfigStore.writeAppConfig(1L, new java.util.LinkedHashMap<>(deep(app)));

        ProfileExportRequest exportRequest = new ProfileExportRequest();
        exportRequest.setPassphrase("migrate-me-now");
        exportRequest.setConfirmPassphrase("migrate-me-now");
        ProfileDomainOptions domains = ProfileDomainOptions.defaults();
        domains.setProjects(false);
        domains.setAiWorkspace(false);
        exportRequest.setDomains(domains);

        byte[] pkg = service.exportProfile(exportRequest);
        assertTrue(pkg.length > 100);

        // Simulate machine B with a different master key by wiping config and using a new codec.
        UserContext.clear();
        Path machineB = tempDir.resolve("machine-b");
        java.nio.file.Files.createDirectories(machineB);
        codecB = SecretTestSupport.testCodec();
        ObjectMapper mapper = new ObjectMapper();
        ConfigDirectoryService configB = new ConfigDirectoryService(machineB);
        ConnectionStore storeB = new FileConnectionStore(configB, mapper, codecB);
        AppConfigStore appStoreB = new AppConfigStore(configB, mapper, codecB);
        UserAppConfigStore userAppB = new UserAppConfigStore(configB, appStoreB, mapper, codecB);
        UserAccessPolicy accessPolicy = new UserAccessPolicy();
        UserResourcePolicy resourcePolicy = new UserResourcePolicy(accessPolicy);
        ProfilePortabilityService serviceB = new ProfilePortabilityService(
                storeB,
                userAppB,
                appStoreB,
                configB,
                codecB,
                mapper,
                accessPolicy,
                resourcePolicy,
                null,
                null,
                new WorkspaceStore(new FileSqlHistoryStore(configB, mapper), configB, mapper),
                null,
                null,
                null,
                null,
                null,
                null);
        UserContext.set(1L, false, "session-b", "default");

        ProfilePreflightResult preflight = serviceB.preflight(pkg, "migrate-me-now");
        assertTrue(preflight.isPassphraseOk());
        assertTrue(preflight.isSchemaCompatible());

        ProfileImportResult imported = serviceB.importProfile(pkg, "migrate-me-now", new ProfileImportOptions());
        assertTrue(imported.isSuccess());
        assertEquals("db-password", storeB.findConnectionById("c1").orElseThrow().getPassword());

        Map<String, Object> restored = userAppB.readAppConfig(1L).orElseThrow();
        @SuppressWarnings("unchecked")
        Map<String, Object> theme = (Map<String, Object>) restored.get("theme");
        assertEquals("dark", theme.get("mode"));
    }

    @Test
    void exportSingleConnectionFiltersCatalog() throws Exception {
        ConnectionGroupEntity group = new ConnectionGroupEntity();
        group.setId("g1");
        group.setLabel("Default");
        connectionStore.saveGroup(group);

        ConnectionEntity first = new ConnectionEntity();
        first.setId("c1");
        first.setGroupId("g1");
        first.setName("Keep Me");
        first.setDbType("mysql");
        first.setHost("127.0.0.1");
        first.setPort("3306");
        first.setPassword("secret-a");
        connectionStore.saveConnection(first);

        ConnectionEntity second = new ConnectionEntity();
        second.setId("c2");
        second.setGroupId("g1");
        second.setName("Skip Me");
        second.setDbType("postgresql");
        second.setHost("127.0.0.1");
        second.setPort("5432");
        second.setPassword("secret-b");
        connectionStore.saveConnection(second);

        ProfileExportRequest exportRequest = new ProfileExportRequest();
        exportRequest.setPassphrase("migrate-me-now");
        exportRequest.setConfirmPassphrase("migrate-me-now");
        ProfileDomainOptions domains = ProfileDomainOptions.defaults();
        domains.setConnections(true);
        domains.setApp(false);
        domains.setSnippets(false);
        domains.setAiWorkspace(false);
        domains.setProjects(false);
        domains.setSavedConsoles(false);
        domains.setSqlHistory(false);
        exportRequest.setDomains(domains);
        exportRequest.setConnectionIds(java.util.List.of("c1"));

        byte[] pkg = service.exportProfile(exportRequest);
        assertTrue(pkg.length > 100);
        assertTrue(service.exportFileName(exportRequest.getProjectId(), exportRequest.getConnectionIds())
                .startsWith("datawise-connection-c1-"));

        ProfilePreflightResult preflight = service.preflight(pkg, "migrate-me-now");
        assertTrue(preflight.isPassphraseOk());
        assertEquals(1, ((Number) preflight.getCounts().get("connections")).intValue());
    }

    @Test
    void exportProjectConnectionsFiltersByMembership() throws Exception {
        ConnectionGroupEntity group = new ConnectionGroupEntity();
        group.setId("g1");
        group.setLabel("Default");
        connectionStore.saveGroup(group);

        ConnectionEntity owned = new ConnectionEntity();
        owned.setId("c-owned");
        owned.setGroupId("g1");
        owned.setUserId(1L);
        owned.setProjectId("proj_a");
        owned.setName("Owned");
        owned.setDbType("mysql");
        owned.setHost("127.0.0.1");
        owned.setPort("3306");
        owned.setPassword("secret-a");
        connectionStore.saveConnection(owned);

        ConnectionEntity shared = new ConnectionEntity();
        shared.setId("c-shared");
        shared.setGroupId("g1");
        shared.setUserId(1L);
        shared.setProjectId("proj_other");
        shared.setSharedProjectIds(java.util.List.of("proj_a"));
        shared.setName("Shared In");
        shared.setDbType("mysql");
        shared.setHost("127.0.0.1");
        shared.setPort("3307");
        shared.setPassword("secret-b");
        connectionStore.saveConnection(shared);

        ConnectionEntity foreign = new ConnectionEntity();
        foreign.setId("c-foreign");
        foreign.setGroupId("g1");
        foreign.setUserId(1L);
        foreign.setProjectId("proj_other");
        foreign.setName("Foreign");
        foreign.setDbType("mysql");
        foreign.setHost("127.0.0.1");
        foreign.setPort("3308");
        foreign.setPassword("secret-c");
        connectionStore.saveConnection(foreign);

        assertEquals(3, connectionStore.findAllConnections().size());
        assertEquals("proj_a", connectionStore.findConnectionById("c-owned").orElseThrow().getProjectId());
        assertTrue(org.apache.datawise.backend.domain.ProjectConnectionMembership.belongsToProject(
                connectionStore.findConnectionById("c-shared").orElseThrow(), "proj_a"));

        ProfileExportRequest exportRequest = new ProfileExportRequest();
        exportRequest.setPassphrase("migrate-me-now");
        exportRequest.setConfirmPassphrase("migrate-me-now");
        ProfileDomainOptions domains = ProfileDomainOptions.defaults();
        domains.setConnections(true);
        domains.setApp(false);
        domains.setSnippets(false);
        domains.setAiWorkspace(false);
        domains.setProjects(false);
        domains.setSavedConsoles(false);
        domains.setSqlHistory(false);
        exportRequest.setDomains(domains);
        exportRequest.setProjectId("proj_a");

        byte[] pkg = service.exportProfile(exportRequest);
        assertTrue(service.exportFileName(exportRequest).startsWith("datawise-project-connections-proj_a-"));
        ProfilePreflightResult preflight = service.preflight(pkg, "migrate-me-now");
        assertTrue(preflight.isPassphraseOk());
        Object connectionCount = preflight.getCounts().get("connections");
        assertTrue(connectionCount instanceof Number, "counts=" + preflight.getCounts());
        assertEquals(2, ((Number) connectionCount).intValue());
    }

    @Test
    void importIntoOtherAccountDoesNotOverwriteOwnerConnections() throws Exception {
        ConnectionGroupEntity ownerGroup = new ConnectionGroupEntity();
        ownerGroup.setId("g1");
        ownerGroup.setLabel("Owner Group");
        ownerGroup.setUserId(1L);
        ownerGroup.setProjectId("proj_default");
        connectionStore.saveGroup(ownerGroup);

        ConnectionEntity ownerConnection = new ConnectionEntity();
        ownerConnection.setId("c1");
        ownerConnection.setGroupId("g1");
        ownerConnection.setUserId(1L);
        ownerConnection.setProjectId("proj_default");
        ownerConnection.setName("Owner MySQL");
        ownerConnection.setDbType("mysql");
        ownerConnection.setHost("10.0.0.1");
        ownerConnection.setPort("3306");
        ownerConnection.setPassword("owner-secret");
        connectionStore.saveConnection(ownerConnection);

        ProfileExportRequest exportRequest = new ProfileExportRequest();
        exportRequest.setPassphrase("migrate-me-now");
        exportRequest.setConfirmPassphrase("migrate-me-now");
        ProfileDomainOptions domains = ProfileDomainOptions.defaults();
        domains.setConnections(true);
        domains.setApp(false);
        domains.setSnippets(false);
        domains.setAiWorkspace(false);
        domains.setProjects(false);
        domains.setSavedConsoles(false);
        domains.setSqlHistory(false);
        exportRequest.setDomains(domains);
        exportRequest.setConnectionIds(java.util.List.of("c1"));
        byte[] pkg = service.exportProfile(exportRequest);

        UserContext.set(2L, false, "session-user-2", "default");
        ProfileImportOptions options = new ProfileImportOptions();
        ProfileDomainOptions importDomains = ProfileDomainOptions.defaults();
        importDomains.setConnections(true);
        importDomains.setApp(false);
        importDomains.setSnippets(false);
        importDomains.setAiWorkspace(false);
        importDomains.setProjects(false);
        importDomains.setSavedConsoles(false);
        importDomains.setSqlHistory(false);
        options.setDomains(importDomains);

        ProfileImportResult imported = service.importProfile(pkg, "migrate-me-now", options);
        assertTrue(imported.isSuccess());
        assertEquals(1, ((Number) imported.getCounts().get("connections")).intValue());

        ConnectionEntity stillOwner = connectionStore.findConnectionById("c1").orElseThrow();
        assertEquals(1L, stillOwner.getUserId());
        assertEquals("10.0.0.1", stillOwner.getHost());
        assertEquals("owner-secret", stillOwner.getPassword());
        assertEquals("proj_default", stillOwner.getProjectId());

        long ownedByImporter = connectionStore.findAllConnections().stream()
                .filter(item -> Long.valueOf(2L).equals(item.getUserId()))
                .count();
        assertEquals(1, ownedByImporter);
        ConnectionEntity copy = connectionStore.findAllConnections().stream()
                .filter(item -> Long.valueOf(2L).equals(item.getUserId()))
                .findFirst()
                .orElseThrow();
        assertFalse("c1".equals(copy.getId()));
        assertEquals("Owner MySQL", copy.getName());
        assertEquals("owner-secret", copy.getPassword());
        assertEquals(2L, copy.getUserId());
        assertTrue(imported.getWarnings().stream().anyMatch(w -> w.startsWith("CONNECTION_ID_REASSIGNED:")));
    }

    @Test
    void configMigrationExportOmitsOtherAccountConnections() throws Exception {
        ConnectionGroupEntity group = new ConnectionGroupEntity();
        group.setId("g1");
        group.setLabel("Shared Root");
        group.setUserId(1L);
        connectionStore.saveGroup(group);

        ConnectionEntity adminConn = new ConnectionEntity();
        adminConn.setId("c-admin");
        adminConn.setGroupId("g1");
        adminConn.setUserId(1L);
        adminConn.setName("Admin DB");
        adminConn.setDbType("mysql");
        adminConn.setHost("10.0.0.1");
        adminConn.setPort("3306");
        adminConn.setPassword("admin-secret");
        connectionStore.saveConnection(adminConn);

        ConnectionEntity demoConn = new ConnectionEntity();
        demoConn.setId("c-demo");
        demoConn.setGroupId("g1");
        demoConn.setUserId(2L);
        demoConn.setName("Demo DB");
        demoConn.setDbType("mysql");
        demoConn.setHost("10.0.0.2");
        demoConn.setPort("3306");
        demoConn.setPassword("demo-secret");
        connectionStore.saveConnection(demoConn);

        ProfileExportRequest exportRequest = new ProfileExportRequest();
        exportRequest.setPassphrase("migrate-me-now");
        exportRequest.setConfirmPassphrase("migrate-me-now");
        ProfileDomainOptions domains = ProfileDomainOptions.defaults();
        domains.setConnections(true);
        domains.setApp(false);
        domains.setSnippets(false);
        domains.setAiWorkspace(false);
        domains.setProjects(false);
        domains.setSavedConsoles(false);
        domains.setSqlHistory(false);
        exportRequest.setDomains(domains);

        UserContext.set(1L, false, "session-admin", "default");
        byte[] pkg = service.exportProfile(exportRequest);
        ProfilePreflightResult preflight = service.preflight(pkg, "migrate-me-now");
        assertEquals(1, ((Number) preflight.getCounts().get("connections")).intValue());

        UserContext.set(2L, false, "session-demo", "default");
        ProfileImportOptions options = new ProfileImportOptions();
        options.setDomains(domains);
        ProfileImportResult imported = service.importProfile(pkg, "migrate-me-now", options);
        assertTrue(imported.isSuccess());

        ConnectionEntity stillDemo = connectionStore.findConnectionById("c-demo").orElseThrow();
        assertEquals(2L, stillDemo.getUserId());
        assertEquals("demo-secret", stillDemo.getPassword());
        assertEquals("10.0.0.2", stillDemo.getHost());

        ConnectionEntity stillAdmin = connectionStore.findConnectionById("c-admin").orElseThrow();
        assertEquals(1L, stillAdmin.getUserId());
        assertEquals("admin-secret", stillAdmin.getPassword());
    }

    @Test
    void omittedSecretsExportPreservesLocalPasswordsOnImport() throws Exception {
        ConnectionGroupEntity group = new ConnectionGroupEntity();
        group.setId("g1");
        group.setLabel("Default");
        group.setUserId(1L);
        connectionStore.saveGroup(group);

        ConnectionEntity connection = new ConnectionEntity();
        connection.setId("c1");
        connection.setGroupId("g1");
        connection.setUserId(1L);
        connection.setName("Local MySQL");
        connection.setDbType("mysql");
        connection.setHost("127.0.0.1");
        connection.setPort("3306");
        connection.setPassword("keep-me");
        connectionStore.saveConnection(connection);

        ProfileExportRequest exportRequest = new ProfileExportRequest();
        exportRequest.setIncludeSecrets(false);
        ProfileDomainOptions domains = ProfileDomainOptions.defaults();
        domains.setConnections(true);
        domains.setApp(false);
        domains.setSnippets(false);
        domains.setAiWorkspace(false);
        domains.setProjects(false);
        domains.setSavedConsoles(false);
        domains.setSqlHistory(false);
        exportRequest.setDomains(domains);

        byte[] pkg = service.exportProfile(exportRequest);
        ProfilePreflightResult preflight = service.preflight(pkg, null);
        assertTrue(preflight.isPassphraseOk());
        assertTrue(preflight.isSchemaCompatible());
        assertEquals(ProfileManifest.SECRET_MODE_OMITTED, preflight.getManifest().getSecretMode());

        ConnectionEntity updated = connectionStore.findConnectionById("c1").orElseThrow();
        updated.setHost("10.0.0.9");
        updated.setPassword("keep-me");
        connectionStore.saveConnection(updated);

        ProfileImportResult imported = service.importProfile(pkg, null, new ProfileImportOptions());
        assertTrue(imported.isSuccess());
        ConnectionEntity after = connectionStore.findConnectionById("c1").orElseThrow();
        assertEquals("127.0.0.1", after.getHost());
        assertEquals("keep-me", after.getPassword());
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> deep(Map<String, Object> source) {
        return new ObjectMapper().convertValue(source, Map.class);
    }
}
