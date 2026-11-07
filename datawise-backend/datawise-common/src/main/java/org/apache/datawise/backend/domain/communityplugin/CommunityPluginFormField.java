package org.apache.datawise.backend.domain.communityplugin;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;

import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public record CommunityPluginFormField(
        String key,
        String label,
        String type,
        String binding,
        Boolean required,
        @JsonProperty("default") Object defaultValue,
        String description,
        String placeholder,
        List<CommunityPluginFormFieldOption> options,
        @JsonProperty("visible_when") JsonNode visibleWhen,
        @JsonProperty("required_when") JsonNode requiredWhen,
        JsonNode picker) {

    public CommunityPluginFormField {
        if (type == null || type.isBlank()) {
            type = "text";
        }
        options = options != null ? List.copyOf(options) : List.of();
    }
}
