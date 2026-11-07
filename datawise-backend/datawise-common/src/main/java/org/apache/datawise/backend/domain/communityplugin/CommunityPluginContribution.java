package org.apache.datawise.backend.domain.communityplugin;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

import java.util.List;

/**
 * Declared contribution inside a community plugin manifest.
 */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type", visible = true)
@JsonSubTypes({
        @JsonSubTypes.Type(value = CommunityPluginContribution.ConnectionProvider.class, name = "connection-provider"),
        @JsonSubTypes.Type(value = CommunityPluginContribution.Workbench.class, name = "workbench"),
        @JsonSubTypes.Type(value = CommunityPluginContribution.FilesystemProvider.class, name = "filesystem-provider"),
        @JsonSubTypes.Type(value = CommunityPluginContribution.ResultView.class, name = "result-view"),
        @JsonSubTypes.Type(value = CommunityPluginContribution.ContextMenu.class, name = "context-menu")
})
@JsonIgnoreProperties(ignoreUnknown = true)
public sealed interface CommunityPluginContribution {

    String type();

    String id();

    String label();

    @JsonIgnoreProperties(ignoreUnknown = true)
    record ConnectionProvider(
            String type,
            String id,
            String label,
            String description,
            String icon,
            List<String> capabilities,
            List<CommunityPluginFormField> fields,
            List<CommunityPluginProviderAction> actions,
            String workbench,
            @JsonAlias("filesystem_provider") String filesystemProvider) implements CommunityPluginContribution {

        public ConnectionProvider {
            if (type == null || type.isBlank()) {
                type = "connection-provider";
            }
            capabilities = capabilities != null ? List.copyOf(capabilities) : List.of();
            fields = fields != null ? List.copyOf(fields) : List.of();
            actions = actions != null ? List.copyOf(actions) : List.of();
        }
    }

    /** Optional connection-form action button (hostApi ^1.1). */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record CommunityPluginProviderAction(
            String id,
            String label,
            String description,
            String variant,
            String when,
            @JsonAlias("requires_valid_form") Boolean requiresValidForm,
            @JsonAlias("timeout_ms") Integer timeoutMs) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Workbench(
            String type,
            String id,
            String label) implements CommunityPluginContribution {

        public Workbench {
            if (type == null || type.isBlank()) {
                type = "workbench";
            }
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record FilesystemProvider(
            String type,
            String id,
            String label,
            String icon,
            List<String> schemes,
            @JsonAlias("root_uri") String rootUri,
            List<String> capabilities,
            /**
             * When true, listings need a live connection/session — do not open the
             * host CommunityFilesystemTab without connectionId. Prefer opening the
             * linked workbench (see {@code openTarget}).
             */
            @JsonAlias("session_bound") Boolean sessionBound,
            /**
             * Where to open this provider from the plugin center:
             * {@code workbench} (default when sessionBound) or {@code host-tab}.
             */
            @JsonAlias("open_target") String openTarget) implements CommunityPluginContribution {

        public FilesystemProvider {
            if (type == null || type.isBlank()) {
                type = "filesystem-provider";
            }
            schemes = schemes != null ? List.copyOf(schemes) : List.of();
            capabilities = capabilities != null ? List.copyOf(capabilities) : List.of();
        }

        public boolean isSessionBound() {
            return Boolean.TRUE.equals(sessionBound);
        }
    }

    /** Hosted thinly: result toolbar invokes {@code result-view/open}. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record ResultView(
            String type,
            String id,
            String label) implements CommunityPluginContribution {

        public ResultView {
            if (type == null || type.isBlank()) {
                type = "result-view";
            }
        }
    }

    /** Hosted thinly: explorer connection menu invokes {@code context-menu/invoke}. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record ContextMenu(
            String type,
            String id,
            String label,
            String menu) implements CommunityPluginContribution {

        public ContextMenu {
            if (type == null || type.isBlank()) {
                type = "context-menu";
            }
        }
    }
}
