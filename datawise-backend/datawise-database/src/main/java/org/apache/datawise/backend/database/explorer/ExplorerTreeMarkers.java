package org.apache.datawise.backend.database.explorer;

import org.apache.datawise.backend.domain.TreeNode;

import java.util.Locale;
import java.util.Set;

/** Explorer tree node meta markers for cache / lazy-load state. */
public final class ExplorerTreeMarkers {

    public static final String TABLES_FOLDER_LOADED_META = "tables:loaded";

    private static final Set<String> LAZY_LOAD_FOLDER_LABELS = Set.of(
            "tables", "workspaces", "models", "views", "functions", "procedures", "triggers", "ai"
    );

    private ExplorerTreeMarkers() {
    }

    public static String folderLoadedMeta(String folderLabel) {
        if (folderLabel == null || folderLabel.isBlank()) {
            return "";
        }
        return folderLabel.trim().toLowerCase(Locale.ROOT) + ":loaded";
    }

    public static boolean isFolderLoaded(TreeNode node) {
        if (node == null || node.getMeta() == null || node.getMeta().isBlank()) {
            return false;
        }
        return node.getMeta().endsWith(":loaded");
    }

    public static boolean isFolderLoaded(TreeNode node, String folderLabel) {
        return node != null && folderLoadedMeta(folderLabel).equals(node.getMeta());
    }

    public static boolean isTablesFolderLoaded(TreeNode node) {
        return isFolderLoaded(node, "tables");
    }

    public static void markFolderLoaded(TreeNode node, String folderLabel) {
        if (node != null && folderLabel != null && !folderLabel.isBlank()) {
            node.setMeta(folderLoadedMeta(folderLabel));
        }
    }

    public static void markTablesFolderLoaded(TreeNode node) {
        markFolderLoaded(node, "tables");
    }

    public static boolean supportsLazyLoadFolderLabel(String folderLabel) {
        return folderLabel != null
                && LAZY_LOAD_FOLDER_LABELS.contains(folderLabel.trim().toLowerCase(Locale.ROOT));
    }
}
