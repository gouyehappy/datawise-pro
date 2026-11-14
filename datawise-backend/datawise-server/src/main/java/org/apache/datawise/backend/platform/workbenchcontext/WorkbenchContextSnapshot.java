package org.apache.datawise.backend.platform.workbenchcontext;

import org.apache.datawise.backend.common.truncation.TruncationMeta;

import java.util.List;
import java.util.Map;

/**
 * Live UI focus snapshot for MCP / in-app AI ({@code get_workbench_context}).
 * See {@code _private/docs/design/AI_WORKBENCH_CONTEXT_AND_MCP.md}.
 */
public record WorkbenchContextSnapshot(
        int schemaVersion,
        String updatedAt,
        String publisher,
        boolean online,
        Focus focus,
        ActiveTab activeTab,
        List<OpenTab> openTabs,
        Selection selection,
        List<PluginFocus> pluginFocus,
        Privacy privacy
) {
    public static final int SCHEMA_VERSION = 1;
    public static final int DEFAULT_BODY_PREVIEW_MAX_CHARS = 8 * 1024;
    public static final int DEFAULT_PLUGIN_TAIL_MAX_CHARS = 4 * 1024;
    public static final int MAX_OPEN_TABS = 32;

    public record Focus(
            String surface,
            String connectionId,
            String connectionName,
            String database,
            String schema,
            String dialect,
            String environment,
            String objectKind,
            String objectName,
            String pluginId,
            String workbenchId
    ) {
    }

    public record ActiveTab(
            String id,
            String type,
            String title,
            String connectionId,
            String database,
            String bodyPreview,
            Boolean bodyTruncated,
            Integer bodyLength,
            /** T-TRUNC-1：与 bodyTruncated / bodyLength 镜像；旧客户端可省略 */
            TruncationMeta bodyTruncation
    ) {
        public ActiveTab(
                String id,
                String type,
                String title,
                String connectionId,
                String database,
                String bodyPreview,
                Boolean bodyTruncated,
                Integer bodyLength
        ) {
            this(id, type, title, connectionId, database, bodyPreview, bodyTruncated, bodyLength, null);
        }
    }

    public record OpenTab(
            String id,
            String type,
            String title,
            String connectionId,
            String database
    ) {
    }

    public record Selection(
            List<Map<String, String>> aiTaggedTables,
            List<String> explorerPath
    ) {
    }

    public record PluginFocus(
            String pluginId,
            String kind,
            String summary,
            Map<String, String> ref,
            String tailPreview
    ) {
    }

    public record Privacy(
            boolean secretsRedacted,
            int bodyPreviewMaxChars,
            int pluginTailMaxChars
    ) {
    }

    public static WorkbenchContextSnapshot emptyOffline(String updatedAt) {
        return new WorkbenchContextSnapshot(
                SCHEMA_VERSION,
                updatedAt,
                "unknown",
                false,
                new Focus("other", null, null, null, null, null, null, null, null, null, null),
                null,
                List.of(),
                null,
                List.of(),
                new Privacy(true, DEFAULT_BODY_PREVIEW_MAX_CHARS, DEFAULT_PLUGIN_TAIL_MAX_CHARS)
        );
    }
}
