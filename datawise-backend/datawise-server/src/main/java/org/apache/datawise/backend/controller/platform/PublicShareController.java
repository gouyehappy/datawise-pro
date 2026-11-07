package org.apache.datawise.backend.controller.platform;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.domain.PublicShareDto;
import org.apache.datawise.backend.service.share.ShareSnapshotService;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

@RestController
public class PublicShareController {

    private final ShareSnapshotService shareSnapshotService;
    private final ObjectMapper objectMapper;

    public PublicShareController(ShareSnapshotService shareSnapshotService, ObjectMapper objectMapper) {
        this.shareSnapshotService = shareSnapshotService;
        this.objectMapper = objectMapper;
    }

    @GetMapping("/api/public/shares/{token}")
    public ApiResponse<PublicShareDto> getJson(@PathVariable String token) {
        return ApiResponse.ok(resolve(token));
    }

    @GetMapping(value = "/share/{token}", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> getHtml(@PathVariable String token) {
        PublicShareDto share = resolve(token);
        return ResponseEntity.ok()
                .contentType(MediaType.TEXT_HTML)
                .body(renderHtml(share));
    }

    private PublicShareDto resolve(String token) {
        try {
            return shareSnapshotService.resolvePublic(token);
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "share not found");
        }
    }

    private String renderHtml(PublicShareDto share) {
        String title = escape(share.title() != null ? share.title() : "Shared chart");
        StringBuilder body = new StringBuilder();
        body.append("<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"/>")
                .append("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"/>")
                .append("<title>").append(title).append("</title>")
                .append("<style>")
                .append("body{font-family:system-ui,sans-serif;margin:0;padding:24px;background:#f6f7f9;color:#1a1a1a}")
                .append("main{max-width:960px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px}")
                .append("h1{font-size:1.25rem;margin:0 0 8px}p{color:#6b7280;margin:0 0 16px;font-size:.9rem}")
                .append(".expiry{background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;padding:8px 12px;border-radius:8px;margin:0 0 16px;font-size:.875rem}")
                .append("table{border-collapse:collapse;width:100%;font-size:.875rem}th,td{border:1px solid #e5e7eb;padding:8px 10px;text-align:left}")
                .append("th{background:#f3f4f6}tr:nth-child(even) td{background:#fafafa}")
                .append("</style></head><body><main>")
                .append("<h1>").append(title).append("</h1>")
                .append("<p>Read-only snapshot · DataWise</p>");
        if (share.expiresAt() != null) {
            body.append("<p class=\"expiry\">This share expires at ")
                    .append(escape(share.expiresAt().toString()))
                    .append(" (UTC).</p>");
        }
        try {
            JsonNode root = objectMapper.readTree(share.payloadJson() != null ? share.payloadJson() : "{}");
            JsonNode rowsNode = root.get("rows");
            JsonNode columnsNode = root.get("columns");
            List<String> columns = new ArrayList<>();
            if (columnsNode != null && columnsNode.isArray()) {
                for (JsonNode col : columnsNode) {
                    if (col.isTextual()) {
                        columns.add(col.asText());
                    } else if (col.isObject()) {
                        JsonNode name = col.get("name");
                        if (name == null) {
                            name = col.get("key");
                        }
                        if (name != null && name.isTextual()) {
                            columns.add(name.asText());
                        }
                    }
                }
            }
            if (columns.isEmpty() && rowsNode != null && rowsNode.isArray() && !rowsNode.isEmpty()) {
                Iterator<String> fields = rowsNode.get(0).fieldNames();
                while (fields.hasNext()) {
                    columns.add(fields.next());
                }
            }
            if (rowsNode == null || !rowsNode.isArray() || rowsNode.isEmpty()) {
                body.append("<p>No rows in this snapshot.</p>");
            } else {
                body.append("<table><thead><tr>");
                for (String column : columns) {
                    body.append("<th>").append(escape(column)).append("</th>");
                }
                body.append("</tr></thead><tbody>");
                for (JsonNode row : rowsNode) {
                    body.append("<tr>");
                    for (String column : columns) {
                        JsonNode cell = row.get(column);
                        body.append("<td>").append(escape(cell == null || cell.isNull() ? "" : cell.asText())).append("</td>");
                    }
                    body.append("</tr>");
                }
                body.append("</tbody></table>");
            }
            JsonNode config = root.get("config");
            if (config != null && config.isObject()) {
                body.append("<p style=\"margin-top:16px\">Chart: ")
                        .append(escape(text(config, "chartType")))
                        .append(" · x=")
                        .append(escape(text(config, "xField")))
                        .append("</p>");
            }
        } catch (Exception ex) {
            body.append("<p>Unable to render snapshot.</p>");
        }
        body.append("</main></body></html>");
        return body.toString();
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value != null && !value.isNull() ? value.asText("") : "";
    }

    private static String escape(String value) {
        if (value == null) {
            return "";
        }
        return value
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;");
    }
}
