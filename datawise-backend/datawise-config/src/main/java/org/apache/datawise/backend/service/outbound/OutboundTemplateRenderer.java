package org.apache.datawise.backend.service.outbound;

import org.apache.datawise.backend.domain.OutboundEvent;

import java.util.LinkedHashMap;
import java.util.Map;

final class OutboundTemplateRenderer {

    private OutboundTemplateRenderer() {
    }

    static String render(String template, OutboundEvent event) {
        if (template == null || template.isBlank()) {
            return template;
        }
        String result = template;
        for (Map.Entry<String, String> entry : variables(event).entrySet()) {
            result = result.replace("{{" + entry.getKey() + "}}", entry.getValue());
        }
        return result;
    }

    static Map<String, String> variables(OutboundEvent event) {
        Map<String, String> vars = new LinkedHashMap<>();
        if (event == null) {
            return vars;
        }
        vars.put("title", event.title() != null ? event.title() : "");
        vars.put("type", event.type() != null ? event.type() : "");
        vars.put("body", event.body() != null ? event.body() : "");
        vars.put("occurredAt", event.occurredAt() != null ? event.occurredAt().toString() : "");
        if (event.data() != null) {
            for (Map.Entry<String, Object> entry : event.data().entrySet()) {
                if (entry.getKey() != null && entry.getValue() != null) {
                    vars.put(entry.getKey(), String.valueOf(entry.getValue()));
                }
            }
        }
        return vars;
    }
}
