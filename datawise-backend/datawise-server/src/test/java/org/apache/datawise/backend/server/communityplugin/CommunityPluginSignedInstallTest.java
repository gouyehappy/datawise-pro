package org.apache.datawise.backend.server.communityplugin;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginInstallPolicy;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginInstallResult;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginManifest;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginTrustKey;
import org.apache.datawise.backend.domain.communityplugin.DwpCodec;
import org.apache.datawise.backend.domain.communityplugin.DwpEd25519;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginBackendEntrypoint;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginContribution;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginEngines;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginEntrypoints;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginFormField;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginUiEntrypoint;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.security.KeyPair;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CommunityPluginSignedInstallTest {

    @TempDir
    Path temp;

    private CommunityPluginInstaller installer;
    private CommunityPluginTrustStore trustStore;
    private final ObjectMapper mapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(temp);
        trustStore = new CommunityPluginTrustStore(configDirectory, mapper);
        installer = new CommunityPluginInstaller(configDirectory, mapper, "4.1.6", trustStore);
    }

    @Test
    void signedInstallRequiresTrustedKey() throws Exception {
        KeyPair keyPair = DwpEd25519.generateKeyPair();
        String keyId = "datawise-examples";
        trustStore.upsertKey(new CommunityPluginTrustKey(
                keyId,
                "DataWise Examples",
                DwpEd25519.encodePublicKey(keyPair.getPublic())
        ));

        byte[] dwp = DwpCodec.buildSigned(
                sampleManifest(),
                Map.of("bin/windows-x86_64/hello.bat", "@echo off\r\n".getBytes(StandardCharsets.UTF_8)),
                mapper,
                keyId,
                keyPair.getPrivate()
        );

        CommunityPluginInstallResult result = installer.installBytes(dwp, CommunityPluginInstallPolicy.SIGNED);
        assertEquals("io.datawise.example.hello", result.plugin().manifest().id());
        assertTrue(result.signed());

        installer.uninstall("io.datawise.example.hello");
        assertTrue(installer.listInstalled().isEmpty());
    }

    private static CommunityPluginManifest sampleManifest() {
        return new CommunityPluginManifest(
                1,
                "io.datawise.example.hello",
                "Hello Workbench",
                "1.0.0",
                "datawise-examples",
                null,
                "Hello",
                "Apache-2.0",
                null,
                null,
                List.of(),
                List.of("host.workbench"),
                new CommunityPluginEngines(">=4.1.0", "^1.0"),
                new CommunityPluginEntrypoints(
                        new CommunityPluginBackendEntrypoint("bin/windows-x86_64/hello.bat", "stdio-jsonl"),
                        new CommunityPluginUiEntrypoint("ui", "ui/index.html")
                ),
                List.of(
                        new CommunityPluginContribution.ConnectionProvider(
                                "connection-provider",
                                "io.datawise.example.hello.connection",
                                "Hello connection",
                                null,
                                null,
                                List.of("test"),
                                List.of(new CommunityPluginFormField(
                                        "host", "Host", "text", "host", true, null, null, null,
                                        null, null, null, null)),
                                List.of(),
                                null,
                                null
                        ),
                        new CommunityPluginContribution.Workbench(
                                "workbench",
                                "io.datawise.example.hello.workbench",
                                "Hello workbench"
                        ),
                        new CommunityPluginContribution.FilesystemProvider(
                                "filesystem-provider",
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
