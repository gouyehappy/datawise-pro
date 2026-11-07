package org.apache.datawise.backend.server.communityplugin;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginInstallResult;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.ClassPathResource;

import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

class CommunityPluginMarketplaceInstallTest {

    @TempDir
    Path temp;

    private CommunityPluginMarketplace marketplace;
    private CommunityPluginInstaller installer;

    @BeforeEach
    void setUp() {
        ObjectMapper mapper = new ObjectMapper();
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(temp);
        CommunityPluginTrustStore trustStore = new CommunityPluginTrustStore(configDirectory, mapper);
        CommunityPluginRepositoryStore repositoryStore = new CommunityPluginRepositoryStore(configDirectory, mapper);
        installer = new CommunityPluginInstaller(configDirectory, mapper, "4.1.6", trustStore);
        marketplace = new CommunityPluginMarketplace(mapper, installer, repositoryStore, trustStore);
    }

    @Test
    void installsHelloFixtureFromClasspathCatalog() {
        assumeTrue(new ClassPathResource(
                "community-plugin-fixtures/io.datawise.example.hello-1.0.0.dwp").exists(),
                "signed hello fixture missing");

        CommunityPluginInstallResult result = marketplace.install("datawise-examples", "io.datawise.example.hello");
        assertEquals("io.datawise.example.hello", result.plugin().manifest().id());
        assertTrue(result.signed());
        assertEquals(1, installer.listInstalled().size());
    }
}
