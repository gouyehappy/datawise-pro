package org.apache.datawise.backend.database.explorer;

import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.schema.SchemaNodeIds;

import java.util.List;
import java.util.Optional;

/**
 * Parses explorer node ids back to catalog/schema scope and matches against cached catalog roots.
 * Used to hydrate missing ancestor nodes in the schema cache before lazy-loading children.
 */
public record SchemaNodeIdScope(String catalog, String schema, HydrationDepth depth) {

    public enum HydrationDepth {
        CATALOG,
        SCHEMA_LIST,
        SCHEMA_BRANCH
    }

    public boolean needsCatalogSchemaList() {
        return depth == HydrationDepth.SCHEMA_LIST || depth == HydrationDepth.SCHEMA_BRANCH;
    }

    public boolean needsSchemaBranch() {
        return depth == HydrationDepth.SCHEMA_BRANCH;
    }

    public static Optional<SchemaNodeIdScope> resolve(
            String connectionId,
            String nodeId,
            List<TreeNode> catalogRoots
    ) {
        if (connectionId == null || nodeId == null || nodeId.isBlank()) {
            return Optional.empty();
        }
        if (connectionId.equals(nodeId)) {
            return Optional.empty();
        }

        String dbPrefix = "db-" + connectionId + "-";
        if (nodeId.startsWith(dbPrefix)) {
            return matchCatalog(catalogRoots, nodeId.substring(dbPrefix.length()), HydrationDepth.CATALOG);
        }

        String schemaPrefix = "schema-" + connectionId + "-";
        if (nodeId.startsWith(schemaPrefix)) {
            return matchCatalogSchema(
                    catalogRoots,
                    nodeId.substring(schemaPrefix.length()),
                    HydrationDepth.SCHEMA_LIST
            );
        }

        for (String folderPrefix : List.of(
                "folder-tables-",
                "folder-ws-",
                "folder-models-",
                "folder-views-",
                "folder-functions-",
                "folder-procedures-",
                "folder-triggers-",
                "folder-ai-"
        )) {
            Optional<SchemaNodeIdScope> folderScope = matchPrefixedScope(
                    nodeId, connectionId, folderPrefix, catalogRoots, HydrationDepth.SCHEMA_BRANCH
            );
            if (folderScope.isPresent()) {
                return folderScope;
            }
        }

        Optional<SchemaNodeIdScope> tableScope = matchPrefixedScope(
                nodeId, connectionId, "table-", catalogRoots, HydrationDepth.SCHEMA_BRANCH
        );
        if (tableScope.isPresent()) {
            return tableScope;
        }

        for (String prefix : List.of("col-", "cols-", "keys-", "pk-", "fk-", "index-")) {
            Optional<SchemaNodeIdScope> sectionScope = matchPrefixedScope(
                    nodeId, connectionId, prefix, catalogRoots, HydrationDepth.SCHEMA_BRANCH
            );
            if (sectionScope.isPresent()) {
                return sectionScope;
            }
        }

        for (String prefix : List.of("ws-file-", "vm-file-")) {
            Optional<SchemaNodeIdScope> fileScope = matchPrefixedScope(
                    nodeId, connectionId, prefix, catalogRoots, HydrationDepth.SCHEMA_BRANCH
            );
            if (fileScope.isPresent()) {
                return fileScope;
            }
        }

        return Optional.empty();
    }

    private static Optional<SchemaNodeIdScope> matchPrefixedScope(
            String nodeId,
            String connectionId,
            String literalPrefix,
            List<TreeNode> catalogRoots,
            HydrationDepth depth
    ) {
        String prefix = literalPrefix + connectionId + "-";
        if (!nodeId.startsWith(prefix)) {
            return Optional.empty();
        }
        return matchCatalogSchema(catalogRoots, nodeId.substring(prefix.length()), depth);
    }

    private static Optional<SchemaNodeIdScope> matchCatalog(
            List<TreeNode> catalogRoots,
            String catalogSlug,
            HydrationDepth depth
    ) {
        for (TreeNode catalogNode : catalogRoots) {
            if (!"database".equals(catalogNode.getType())) {
                continue;
            }
            if (catalogSlug.equals(SchemaNodeIds.slug(catalogNode.getLabel()))) {
                return Optional.of(new SchemaNodeIdScope(catalogNode.getLabel(), null, depth));
            }
        }
        return Optional.empty();
    }

    private static Optional<SchemaNodeIdScope> matchCatalogSchema(
            List<TreeNode> catalogRoots,
            String tail,
            HydrationDepth depth
    ) {
        if (tail == null || tail.isBlank()) {
            return Optional.empty();
        }
        for (TreeNode catalogNode : catalogRoots) {
            if (!"database".equals(catalogNode.getType())) {
                continue;
            }
            String catalogSlug = SchemaNodeIds.slug(catalogNode.getLabel());
            if (tail.equals(catalogSlug)) {
                // Keep caller depth: folder/table ids under a flat catalog (MySQL) pass
                // SCHEMA_BRANCH so hydrator loads database children before resolving the folder.
                return Optional.of(new SchemaNodeIdScope(catalogNode.getLabel(), null, depth));
            }
            String catalogPrefix = catalogSlug + "-";
            if (!tail.startsWith(catalogPrefix)) {
                continue;
            }
            String afterCatalog = tail.substring(catalogPrefix.length());
            String schemaLabel = resolveSchemaLabel(catalogNode, afterCatalog);
            if (schemaLabel == null) {
                continue;
            }
            return Optional.of(new SchemaNodeIdScope(catalogNode.getLabel(), schemaLabel, depth));
        }
        return Optional.empty();
    }

    private static String resolveSchemaLabel(TreeNode catalogNode, String afterCatalog) {
        if (afterCatalog == null || afterCatalog.isBlank()) {
            return null;
        }
        List<TreeNode> children = catalogNode.getChildren();
        if (children != null) {
            for (TreeNode child : children) {
                if (!"schema".equals(child.getType())) {
                    continue;
                }
                String schemaSlug = SchemaNodeIds.slug(child.getLabel());
                if (afterCatalog.equals(schemaSlug) || afterCatalog.startsWith(schemaSlug + "-")) {
                    return child.getLabel();
                }
            }
        }
        int dash = afterCatalog.indexOf('-');
        String schemaSlug = dash >= 0 ? afterCatalog.substring(0, dash) : afterCatalog;
        return schemaSlug.isBlank() ? null : schemaSlug;
    }
}
