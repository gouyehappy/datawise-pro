package org.apache.datawise.backend.domain.communityplugin;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;
import java.util.Map;

/**
 * {@code manifest.json} inside a {@code .dwp} community plugin package.
 * See {@code _private/docs/design/COMMUNITY_PLUGIN_PLATFORM.md}.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record CommunityPluginManifest(
        @JsonAlias("manifest_version") int manifestVersion,
        String id,
        String name,
        String version,
        String publisher,
        String icon,
        String description,
        String license,
        String source,
        String homepage,
        List<String> tags,
        List<String> permissions,
        CommunityPluginEngines engines,
        CommunityPluginEntrypoints entrypoints,
        List<CommunityPluginContribution> contributions,
        /**
         * Optional display-copy overrides keyed by locale tag
         * ({@code {"zh-CN": {name, description, contributions: {…}}}}, hostApi 1.3).
         * Opaque to the host backend — the workbench/connection-form display layer
         * resolves them with an English (manifest base) fallback.
         */
        Map<String, Object> localizations) {

    public CommunityPluginManifest {
        if (manifestVersion <= 0) {
            manifestVersion = 1;
        }
        tags = tags != null ? List.copyOf(tags) : List.of();
        permissions = permissions != null ? List.copyOf(permissions) : List.of();
        contributions = contributions != null ? List.copyOf(contributions) : List.of();
    }
}
