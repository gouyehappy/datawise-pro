package org.apache.datawise.backend.domain.communityplugin;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DwpCodecTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @TempDir
    Path temp;

    @Test
    void buildAndVerifyUnsignedDevelopmentPackage() throws Exception {
        CommunityPluginManifest manifest = sampleManifest();
        Map<String, byte[]> payload = new LinkedHashMap<>();
        payload.put("bin/windows-x86_64/hello.bat", "@echo off\r\necho hello\r\n".getBytes(StandardCharsets.UTF_8));
        payload.put("ui/index.html", "<html></html>".getBytes(StandardCharsets.UTF_8));
        payload.put("assets/plugin.svg", "<svg/>".getBytes(StandardCharsets.UTF_8));

        byte[] dwp = DwpCodec.buildUnsigned(manifest, payload, mapper);
        DwpCodec.VerifiedPackage verified = DwpCodec.verify(dwp, CommunityPluginInstallPolicy.DEVELOPMENT, mapper);

        assertEquals("io.datawise.example.hello", verified.manifest().id());
        assertFalse(verified.signed());
        assertTrue(verified.entries().containsKey("ui/index.html"));
        assertEquals(3, verified.manifest().contributions().size());
    }

    @Test
    void localizationsRoundTripThroughPackage() throws Exception {
        // hostApi 1.3: display-copy overrides must survive the dwp parse/verify
        // round trip untouched — the host backend treats them as opaque data.
        CommunityPluginManifest manifest = new CommunityPluginManifest(
                1,
                "io.datawise.example.hello",
                "Hello Workbench",
                "1.0.0",
                "datawise-examples",
                null,
                "Hello community plugin",
                "Apache-2.0",
                null,
                null,
                List.of("example"),
                List.of("host.workbench"),
                new CommunityPluginEngines(">=4.1.0", "^1.3"),
                new CommunityPluginEntrypoints(
                        new CommunityPluginBackendEntrypoint("bin/windows-x86_64/hello.bat", "stdio-jsonl"),
                        new CommunityPluginUiEntrypoint("ui", "ui/index.html")),
                List.of(new CommunityPluginContribution.Workbench(
                        null, "io.datawise.example.hello.workbench", "Hello workbench")),
                Map.of("zh-CN", Map.of("name", "你好工作台")));

        byte[] dwp = DwpCodec.buildUnsigned(manifest, Map.of(), mapper);
        DwpCodec.VerifiedPackage verified = DwpCodec.verify(dwp, CommunityPluginInstallPolicy.DEVELOPMENT, mapper);

        Object zh = verified.manifest().localizations().get("zh-CN");
        assertTrue(zh instanceof Map<?, ?>);
        assertEquals("你好工作台", ((Map<?, ?>) zh).get("name"));
    }

    @Test
    void signedPolicyRejectsUnsignedPackage() throws Exception {
        byte[] dwp = DwpCodec.buildUnsigned(sampleManifest(), Map.of(
                "bin/windows-x86_64/hello.bat", "x".getBytes(StandardCharsets.UTF_8)), mapper);
        assertThrows(CommunityPluginException.class,
                () -> DwpCodec.verify(dwp, CommunityPluginInstallPolicy.SIGNED, mapper));
    }

    @Test
    void verifiesSignedPackageAgainstTrustKey() throws Exception {
        var keyPair = DwpEd25519.generateKeyPair();
        String keyId = "datawise-examples";
        byte[] dwp = DwpCodec.buildSigned(
                sampleManifest(),
                Map.of("bin/windows-x86_64/hello.bat", "x".getBytes(StandardCharsets.UTF_8)),
                mapper,
                keyId,
                keyPair.getPrivate());
        Map<String, String> trust = Map.of(keyId, DwpEd25519.encodePublicKey(keyPair.getPublic()));
        DwpCodec.VerifiedPackage verified = DwpCodec.verify(dwp, CommunityPluginInstallPolicy.SIGNED, mapper, trust);
        assertTrue(verified.signed());
        assertEquals("io.datawise.example.hello", verified.manifest().id());
    }

    @Test
    void rejectsSignedPackageWithUnknownKey() throws Exception {
        var keyPair = DwpEd25519.generateKeyPair();
        byte[] dwp = DwpCodec.buildSigned(
                sampleManifest(),
                Map.of("bin/windows-x86_64/hello.bat", "x".getBytes(StandardCharsets.UTF_8)),
                mapper,
                "unknown-key",
                keyPair.getPrivate());
        assertThrows(CommunityPluginException.class,
                () -> DwpCodec.verify(dwp, CommunityPluginInstallPolicy.SIGNED, mapper, Map.of()));
    }

    @Test
    void rejectsPathTraversalEntries() {
        assertThrows(CommunityPluginException.class, () -> DwpCodec.normalizeEntryName("../evil"));
        assertThrows(CommunityPluginException.class, () -> DwpCodec.normalizeEntryName("/abs"));
    }

    private static CommunityPluginManifest sampleManifest() {
        return new CommunityPluginManifest(
                1,
                "io.datawise.example.hello",
                "Hello Workbench",
                "1.0.0",
                "datawise-examples",
                "assets/plugin.svg",
                "Hello community plugin",
                "Apache-2.0",
                null,
                null,
                List.of("example"),
                List.of("host.workbench", "host.filesystem"),
                new CommunityPluginEngines(">=4.1.0", "^1.0"),
                new CommunityPluginEntrypoints(
                        new CommunityPluginBackendEntrypoint("bin/windows-x86_64/hello.bat", "stdio-jsonl"),
                        new CommunityPluginUiEntrypoint("ui", "ui/index.html")),
                List.of(
                        new CommunityPluginContribution.ConnectionProvider(
                                "connection-provider",
                                "io.datawise.example.hello.connection",
                                "Hello connection",
                                null,
                                "assets/plugin.svg",
                                List.of("test", "connect"),
                                List.of(new CommunityPluginFormField(
                                        "host", "Host", "text", "host", true, "127.0.0.1", null, null,
                                        null, null, null, null)),
                                List.of(),
                                "io.datawise.example.hello.workbench",
                                "io.datawise.example.hello.fs"),
                        new CommunityPluginContribution.Workbench(
                                "workbench",
                                "io.datawise.example.hello.workbench",
                                "Hello workbench"),
                        new CommunityPluginContribution.FilesystemProvider(
                                "filesystem-provider",
                                "io.datawise.example.hello.fs",
                                "Hello files",
                                null,
                                List.of("hello"),
                                "hello:/",
                                List.of("read"),
                                null,
                                null)),
                null);
    }
}
