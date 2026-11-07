package org.apache.datawise.backend.domain.communityplugin;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * Community plugin marketplace repository entry ({@code .repositories.json}).
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record CommunityPluginRepository(
        String id,
        String name,
        String url,
        boolean enabled) {
}
