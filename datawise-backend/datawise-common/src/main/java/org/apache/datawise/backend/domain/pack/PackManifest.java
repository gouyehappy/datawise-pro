package org.apache.datawise.backend.domain.pack;

import java.util.List;

/**
 * {@code manifest.json} inside a {@code .dpk} — PRODUCT_EXTENSION_PACKS.md §5.1.
 */
public record PackManifest(
        int schemaVersion,
        String packId,
        String version,
        String minCoreVersion,
        String maxCoreVersion,
        List<String> capabilities,
        List<String> plugins,
        List<String> extensionPoints,
        boolean requiresRestart,
        String channel) {

    public PackManifest {
        if (schemaVersion <= 0) {
            schemaVersion = 1;
        }
        capabilities = capabilities != null ? List.copyOf(capabilities) : List.of();
        plugins = plugins != null ? List.copyOf(plugins) : List.of();
        extensionPoints = extensionPoints != null ? List.copyOf(extensionPoints) : List.of();
        if (channel == null || channel.isBlank()) {
            channel = "stable";
        }
    }

    public static PackManifest of(String packId, String version) {
        return new PackManifest(1, packId, version, "4.0.0", "4.99.99", List.of(), List.of(), List.of(), true, "stable");
    }
}
