package org.apache.datawise.backend.domain.communityplugin;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record CommunityPluginFormFieldOption(String label, String value) {
}
