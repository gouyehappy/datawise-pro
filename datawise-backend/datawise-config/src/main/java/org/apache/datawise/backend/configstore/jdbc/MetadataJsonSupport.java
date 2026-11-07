package org.apache.datawise.backend.configstore.jdbc;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.Collections;
import java.util.List;
import java.util.Map;

final class MetadataJsonSupport {

    private MetadataJsonSupport() {
    }

    static String writeMap(ObjectMapper mapper, Map<String, Boolean> value) {
        if (value == null) {
            return null;
        }
        try {
            return mapper.writeValueAsString(value);
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to serialize map", ex);
        }
    }

    static Map<String, Boolean> readMap(ObjectMapper mapper, String json) {
        if (json == null || json.isBlank()) {
            return null;
        }
        try {
            return mapper.readValue(json, new TypeReference<>() {
            });
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to deserialize map", ex);
        }
    }

    static String writeStringList(ObjectMapper mapper, List<String> value) {
        if (value == null) {
            return "[]";
        }
        try {
            return mapper.writeValueAsString(value);
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to serialize list", ex);
        }
    }

    static List<String> readStringList(ObjectMapper mapper, String json) {
        if (json == null || json.isBlank()) {
            return Collections.emptyList();
        }
        try {
            return mapper.readValue(json, new TypeReference<>() {
            });
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to deserialize list", ex);
        }
    }
}
