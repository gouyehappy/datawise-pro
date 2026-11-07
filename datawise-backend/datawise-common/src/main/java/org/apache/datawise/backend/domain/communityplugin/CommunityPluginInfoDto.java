package org.apache.datawise.backend.domain.communityplugin;

import java.util.List;

/** API DTO for an installed community plugin (no Path). */
public record CommunityPluginInfoDto(
        CommunityPluginManifest manifest,
        CompatibilityDto compatibility,
        String path) {

    public record CompatibilityDto(
            boolean compatible,
            List<String> errors,
            List<String> warnings,
            String target) {

        public CompatibilityDto {
            errors = errors != null ? List.copyOf(errors) : List.of();
            warnings = warnings != null ? List.copyOf(warnings) : List.of();
        }
    }

    public static CommunityPluginInfoDto from(InstalledCommunityPlugin plugin) {
        var c = plugin.compatibility();
        return new CommunityPluginInfoDto(
                plugin.manifest(),
                new CompatibilityDto(c.compatible(), c.errors(), c.warnings(), c.target()),
                plugin.path() != null ? plugin.path().toString() : null);
    }
}
