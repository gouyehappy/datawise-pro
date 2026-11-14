package org.apache.datawise.backend.domain.communityplugin;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CommunityPluginCatalogExpectationTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void acceptsMatchingPackageSha256() {
        ObjectNode entry = baseEntry();
        entry.put("packageSha256", "abc123");
        DwpCodec.VerifiedPackage verified = verified("abc123");
        assertDoesNotThrow(() -> CommunityPluginCatalogExpectation.validate(entry, verified));
    }

    @Test
    void rejectsMismatchedPackageSha256() {
        ObjectNode entry = baseEntry();
        entry.put("packageSha256", "abc123");
        DwpCodec.VerifiedPackage verified = verified("deadbeef");
        CommunityPluginException ex = assertThrows(
                CommunityPluginException.class,
                () -> CommunityPluginCatalogExpectation.validate(entry, verified)
        );
        assertTrue(ex.getMessage().contains("packageSha256"));
    }

    @Test
    void skipsShaWhenCatalogOmitsReceipt() {
        ObjectNode entry = baseEntry();
        DwpCodec.VerifiedPackage verified = verified("abc123");
        assertDoesNotThrow(() -> CommunityPluginCatalogExpectation.validate(entry, verified));
    }

    private ObjectNode baseEntry() {
        ObjectNode entry = mapper.createObjectNode();
        entry.put("id", "io.datawise.example.hello");
        entry.put("version", "1.0.0");
        entry.put("publisher", "datawise-examples");
        entry.putArray("permissions").add("host.workbench");
        entry.put("signingKeyId", "datawise-examples");
        return entry;
    }

    private static DwpCodec.VerifiedPackage verified(String packageSha256) {
        CommunityPluginManifest manifest = new CommunityPluginManifest(
                1,
                "io.datawise.example.hello",
                "Hello",
                "1.0.0",
                "datawise-examples",
                null,
                null,
                null,
                null,
                null,
                List.of(),
                List.of("host.workbench"),
                null,
                null,
                List.of(),
                null
        );
        return new DwpCodec.VerifiedPackage(manifest, Map.of(), packageSha256, true, "datawise-examples");
    }
}
