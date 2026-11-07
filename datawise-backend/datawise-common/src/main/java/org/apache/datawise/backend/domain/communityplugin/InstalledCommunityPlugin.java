package org.apache.datawise.backend.domain.communityplugin;

import java.nio.file.Path;
import java.util.List;

public record InstalledCommunityPlugin(
        CommunityPluginManifest manifest,
        Path path,
        CommunityPluginCompatibility compatibility) {

    public record CommunityPluginCompatibility(
            boolean compatible,
            List<String> errors,
            List<String> warnings,
            String target) {

        public CommunityPluginCompatibility {
            errors = errors != null ? List.copyOf(errors) : List.of();
            warnings = warnings != null ? List.copyOf(warnings) : List.of();
        }

        public static CommunityPluginCompatibility ok(String target) {
            return new CommunityPluginCompatibility(true, List.of(), List.of(), target);
        }

        public static CommunityPluginCompatibility fail(String error) {
            return new CommunityPluginCompatibility(false, List.of(error), List.of(), null);
        }
    }
}
