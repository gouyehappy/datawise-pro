package org.apache.datawise.backend.domain.communityplugin;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.HashSet;
import java.util.Set;

/**
 * Store install checks that the signed package matches catalog expectations.
 */
public final class CommunityPluginCatalogExpectation {

    private CommunityPluginCatalogExpectation() {
    }

    public static void validate(JsonNode entry, DwpCodec.VerifiedPackage verified) {
        if (entry == null || verified == null || verified.manifest() == null) {
            throw new CommunityPluginException("Catalog expectation validation failed: missing entry or package");
        }
        CommunityPluginManifest manifest = verified.manifest();
        requireMatch(entry, "id", manifest.id());
        if (entry.hasNonNull("version") && !entry.path("version").asText("").isBlank()) {
            requireMatch(entry, "version", manifest.version());
        }
        if (entry.hasNonNull("publisher") && !entry.path("publisher").asText("").isBlank()) {
            String expected = entry.path("publisher").asText();
            String actual = manifest.publisher() != null ? manifest.publisher() : "";
            if (!expected.equals(actual)) {
                throw new CommunityPluginException(
                        "Catalog publisher mismatch: expected '" + expected + "' but package has '" + actual + "'");
            }
        }
        if (entry.has("permissions") && entry.path("permissions").isArray()) {
            Set<String> expected = new HashSet<>();
            for (JsonNode node : entry.path("permissions")) {
                if (node != null && !node.asText("").isBlank()) {
                    expected.add(node.asText().trim());
                }
            }
            Set<String> actual = new HashSet<>(manifest.permissions());
            if (!actual.equals(expected)) {
                throw new CommunityPluginException(
                        "Catalog permissions mismatch: expected " + expected + " but package has " + actual);
            }
        }
        if (entry.hasNonNull("signingKeyId") && !entry.path("signingKeyId").asText("").isBlank()) {
            String expectedKey = entry.path("signingKeyId").asText();
            String actualKey = verified.signingKeyId();
            if (actualKey == null || actualKey.isBlank()) {
                throw new CommunityPluginException("Catalog expects signingKeyId '" + expectedKey + "' but package is unsigned");
            }
            if (!expectedKey.equals(actualKey)) {
                throw new CommunityPluginException(
                        "Catalog signingKeyId mismatch: expected '" + expectedKey + "' but package used '" + actualKey + "'");
            }
        }
        // MetaForge B4：目录收据 — 有 packageSha256 时必须与下载包字节一致（可选字段，旧目录兼容）。
        if (entry.hasNonNull("packageSha256") && !entry.path("packageSha256").asText("").isBlank()) {
            String expectedSha = entry.path("packageSha256").asText().trim().toLowerCase();
            String actualSha = verified.packageSha256() != null
                    ? verified.packageSha256().trim().toLowerCase()
                    : "";
            if (!expectedSha.equals(actualSha)) {
                throw new CommunityPluginException(
                        "Catalog packageSha256 mismatch: expected '" + expectedSha + "' but package has '" + actualSha + "'");
            }
        }
    }

    private static void requireMatch(JsonNode entry, String field, String actual) {
        String expected = entry.path(field).asText("");
        if (expected.isBlank()) {
            return;
        }
        if (!expected.equals(actual)) {
            throw new CommunityPluginException(
                    "Catalog " + field + " mismatch: expected '" + expected + "' but package has '" + actual + "'");
        }
    }
}
