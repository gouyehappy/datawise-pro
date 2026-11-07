package org.apache.datawise.backend.server.communityplugin;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginInstallPolicy;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginInstallResult;
import org.apache.datawise.backend.domain.communityplugin.DwpCodec;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PackagedHelloDwpInstallTest {

    @TempDir
    Path temp;

    @Test
    void installsPackagedHelloWorkbenchDwp() throws Exception {
        Path dwp = Path.of("..", "..", "community-plugins", "examples", "hello-workbench", "dist",
                "io.datawise.example.hello-1.0.0.dwp").normalize().toAbsolutePath();
        // When running from datawise-server module cwd is datawise-backend/datawise-server
        if (!Files.isRegularFile(dwp)) {
            dwp = Path.of("community-plugins", "examples", "hello-workbench", "dist",
                    "io.datawise.example.hello-1.0.0.dwp").toAbsolutePath();
        }
        if (!Files.isRegularFile(dwp)) {
            dwp = Path.of("..", "community-plugins", "examples", "hello-workbench", "dist",
                    "io.datawise.example.hello-1.0.0.dwp").normalize().toAbsolutePath();
        }
        // Resolve from repo root relative to this test class location is brittle; try a few candidates.
        Path repoCandidate = Path.of(System.getProperty("user.dir"));
        for (int i = 0; i < 4 && !Files.isRegularFile(dwp); i++) {
            Path tryPath = repoCandidate.resolve("community-plugins/examples/hello-workbench/dist/io.datawise.example.hello-1.0.0.dwp");
            if (Files.isRegularFile(tryPath)) {
                dwp = tryPath;
                break;
            }
            repoCandidate = repoCandidate.getParent();
            if (repoCandidate == null) break;
        }
        Assumptions.assumeTrue(Files.isRegularFile(dwp), "hello .dwp not packaged yet: run package.mjs");

        ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
        DwpCodec.VerifiedPackage verified = DwpCodec.verify(Files.readAllBytes(dwp), CommunityPluginInstallPolicy.DEVELOPMENT, mapper);
        assertEquals("io.datawise.example.hello", verified.manifest().id());
        assertTrue(verified.entries().containsKey("bin/hello-plugin.jar"));

        CommunityPluginInstaller installer = new CommunityPluginInstaller(new ConfigDirectoryService(temp), mapper, "4.1.6");
        CommunityPluginInstallResult result = installer.installBytes(Files.readAllBytes(dwp), CommunityPluginInstallPolicy.DEVELOPMENT);
        assertEquals("1.0.0", result.plugin().manifest().version());
        assertTrue(Files.isRegularFile(result.path().resolve("bin/hello-plugin.jar")));
        assertEquals(5, result.plugin().manifest().contributions().size());
    }
}
