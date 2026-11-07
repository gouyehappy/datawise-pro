package org.apache.datawise.backend.configstore.app;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.common.support.XmlConfigSupport;
import org.w3c.dom.Document;
import org.w3c.dom.Element;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class AppConfigSections {

    public static final String[] JSON_SECTIONS = {
            "theme",
            "editor",
            "window",
            "layout",
            "explorer",
            "workspace",
            "localFiles",
            "profile",
            "ai",
            "shortcuts",
            "sqlEditorShortcutsShared",
            "sqlEditorShortcuts",
            "connectionHealth",
            "dangerousSql",
            "dashboard",
            "plugins",
    };

    private AppConfigSections() {
    }

    public static Map<String, Object> mapFromDocument(ObjectMapper objectMapper, Document document) throws Exception {
        Element root = XmlConfigSupport.rootElement(document);
        Map<String, Object> config = new LinkedHashMap<>();
        String versionText = root.getAttribute("version");
        if (!versionText.isBlank()) {
            config.put("version", Integer.parseInt(versionText));
        }
        String exportedAt = root.getAttribute("exported-at");
        if (!exportedAt.isBlank()) {
            config.put("exportedAt", exportedAt);
        }
        String locale = XmlConfigSupport.childText(root, "locale");
        if (locale != null && !locale.isBlank()) {
            config.put("locale", locale.trim());
        }
        for (String section : JSON_SECTIONS) {
            String json = XmlConfigSupport.childText(root, section);
            if (json == null || json.isBlank()) {
                continue;
            }
            config.put(section, objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {
            }));
        }
        return config;
    }

    public static void writeToDocument(ObjectMapper objectMapper, Document document, Map<String, Object> config) throws Exception {
        Element root = document.createElement("datawise-app");
        Object version = config.get("version");
        root.setAttribute("version", version != null ? String.valueOf(version) : "2");
        Object exportedAt = config.get("exportedAt");
        root.setAttribute(
                "exported-at",
                exportedAt instanceof String text && !text.isBlank() ? text : Instant.now().toString());
        document.appendChild(root);

        Object locale = config.get("locale");
        if (locale instanceof String text && !text.isBlank()) {
            XmlConfigSupport.appendTextElement(document, root, "locale", text.trim());
        }

        for (String section : JSON_SECTIONS) {
            Object value = config.get(section);
            if (value == null) {
                continue;
            }
            String json = objectMapper.writeValueAsString(value);
            XmlConfigSupport.appendCdataElement(document, root, section, json);
        }
    }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> deepCopy(Map<String, Object> source) {
        Map<String, Object> copy = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : source.entrySet()) {
            Object value = entry.getValue();
            if (value instanceof Map<?, ?> map) {
                copy.put(entry.getKey(), deepCopy((Map<String, Object>) map));
            } else if (value instanceof List<?> list) {
                copy.put(entry.getKey(), deepCopyList(list));
            } else {
                copy.put(entry.getKey(), value);
            }
        }
        return copy;
    }

    @SuppressWarnings("unchecked")
    private static List<Object> deepCopyList(List<?> source) {
        List<Object> copy = new ArrayList<>(source.size());
        for (Object item : source) {
            if (item instanceof Map<?, ?> map) {
                copy.add(deepCopy((Map<String, Object>) map));
            } else if (item instanceof List<?> list) {
                copy.add(deepCopyList(list));
            } else {
                copy.add(item);
            }
        }
        return copy;
    }
}
