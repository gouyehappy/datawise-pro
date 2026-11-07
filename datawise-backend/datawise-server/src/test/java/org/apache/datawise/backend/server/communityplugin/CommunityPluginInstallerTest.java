package org.apache.datawise.backend.server.communityplugin;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginContribution;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginBackendEntrypoint;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginEngines;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginEntrypoints;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginFormField;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginInstallPolicy;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginInstallResult;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginManifest;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginUiEntrypoint;
import org.apache.datawise.backend.domain.communityplugin.DwpCodec;
import org.apache.datawise.backend.domain.communityplugin.InstalledCommunityPlugin;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CommunityPluginInstallerTest {

    @TempDir
    Path temp;

    private CommunityPluginInstaller installer;
    private final ObjectMapper mapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(temp);
        installer = new CommunityPluginInstaller(configDirectory, mapper, "4.1.6");
    }

    @Test
    void installListAndUninstallDevelopmentPackage() throws Exception {
        byte[] dwp = DwpCodec.buildUnsigned(sampleManifest("1.0.0"), Map.of(
                "bin/windows-x86_64/hello.bat", "@echo off\r\n".getBytes(StandardCharsets.UTF_8),
                "ui/index.html", "<html>hi</html>".getBytes(StandardCharsets.UTF_8)
        ), mapper);

        CommunityPluginInstallResult result = installer.installBytes(dwp, CommunityPluginInstallPolicy.DEVELOPMENT);
        assertEquals("io.datawise.example.hello", result.plugin().manifest().id());
        assertEquals("1.0.0", result.plugin().manifest().version());
        assertTrue(Files.isRegularFile(result.path().resolve("manifest.json")));

        List<InstalledCommunityPlugin> listed = installer.listInstalled();
        assertEquals(1, listed.size());
        assertEquals(3, listed.get(0).manifest().contributions().size());

        installer.uninstall("io.datawise.example.hello");
        assertTrue(installer.listInstalled().isEmpty());
    }

    @Test
    void upgradeKeepsPreviousVersionForRollback() throws Exception {
        byte[] v1 = DwpCodec.buildUnsigned(sampleManifest("1.0.0"), Map.of(
                "bin/windows-x86_64/hello.bat", "v1".getBytes(StandardCharsets.UTF_8)
        ), mapper);
        byte[] v2 = DwpCodec.buildUnsigned(sampleManifest("1.1.0"), Map.of(
                "bin/windows-x86_64/hello.bat", "v2".getBytes(StandardCharsets.UTF_8)
        ), mapper);

        installer.installBytes(v1, CommunityPluginInstallPolicy.DEVELOPMENT);
        CommunityPluginInstallResult upgraded = installer.installBytes(v2, CommunityPluginInstallPolicy.DEVELOPMENT);
        assertEquals("1.0.0", upgraded.previousVersion());
        assertEquals("1.1.0", upgraded.plugin().manifest().version());

        CommunityPluginInstallResult rolled = installer.rollback("io.datawise.example.hello");
        assertEquals("1.0.0", rolled.plugin().manifest().version());
    }

    private static CommunityPluginManifest sampleManifest(String version) {
        return new CommunityPluginManifest(
                1,
                "io.datawise.example.hello",
                "Hello Workbench",
                version,
                "datawise-examples",
                null,
                "Hello",
                "Apache-2.0",
                null,
                null,
                List.of("example"),
                List.of("host.workbench", "host.filesystem"),
                new CommunityPluginEngines(">=4.1.0", "^1.0"),
                new CommunityPluginEntrypoints(
                        new CommunityPluginBackendEntrypoint("bin/windows-x86_64/hello.bat", "stdio-jsonl"),
                        new CommunityPluginUiEntrypoint("ui", "ui/index.html")
                ),
                List.of(
                        new CommunityPluginContribution.ConnectionProvider(
                                null,
                                "io.datawise.example.hello.connection",
                                "Hello connection",
                                null,
                                null,
                                List.of("test", "connect"),
                                List.of(new CommunityPluginFormField(
                                        "host", "Host", "text", "host", true, "127.0.0.1", null, null,
                                        null, null, null, null)),
                                List.of(),
                                "io.datawise.example.hello.workbench",
                                "io.datawise.example.hello.fs"
                        ),
                        new CommunityPluginContribution.Workbench(
                                null,
                                "io.datawise.example.hello.workbench",
                                "Hello workbench"
                        ),
                        new CommunityPluginContribution.FilesystemProvider(
                                null,
                                "io.datawise.example.hello.fs",
                                "Hello files",
                                null,
                                List.of("hello"),
                                "hello:/",
                                List.of("read"),
                                null,
                                null
                        )
                ),
                null
        );
    }
}
