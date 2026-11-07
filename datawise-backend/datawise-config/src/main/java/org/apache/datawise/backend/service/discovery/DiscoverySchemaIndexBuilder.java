package org.apache.datawise.backend.service.discovery;

import org.apache.datawise.backend.domain.DiscoveryColumnPeekDto;
import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.model.ConnectionEntity;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Builds flat discovery rows from an Explorer schema cache tree.
 */
public final class DiscoverySchemaIndexBuilder {

    private static final int MAX_COLUMN_PEEK = 40;
    private static final Pattern HASHTAG = Pattern.compile("#([\\p{L}\\p{N}_-]+)");
    private static final Pattern WORD = Pattern.compile("[\\p{L}\\p{N}_]+");

    private DiscoverySchemaIndexBuilder() {
    }

    public static List<DiscoveryIndexedRelation> build(ConnectionEntity connection, List<TreeNode> roots) {
        if (connection == null || connection.getId() == null || connection.getId().isBlank()) {
            return List.of();
        }
        if (roots == null || roots.isEmpty()) {
            return List.of();
        }
        List<DiscoveryIndexedRelation> out = new ArrayList<>();
        for (TreeNode root : roots) {
            walk(root, List.of(), connection, out);
        }
        return List.copyOf(out);
    }

    public static List<String> extractWords(String searchText) {
        if (searchText == null || searchText.isBlank()) {
            return List.of();
        }
        LinkedHashSet<String> words = new LinkedHashSet<>();
        Matcher matcher = WORD.matcher(searchText.toLowerCase(Locale.ROOT));
        while (matcher.find()) {
            String word = matcher.group();
            if (word.length() >= 1) {
                words.add(word);
            }
        }
        return List.copyOf(words);
    }

    private static void walk(
                             TreeNode node,
                             List<TreeNode> parents,
                             ConnectionEntity connection,
                             List<DiscoveryIndexedRelation> out) {
        String type = node.getType();
        if ("table".equals(type) || "view".equals(type)) {
            out.add(toRelation(node, parents, connection));
        }
        List<TreeNode> nextParents = new ArrayList<>(parents);
        nextParents.add(node);
        List<TreeNode> children = node.getChildren();
        if (children == null || children.isEmpty()) {
            return;
        }
        for (TreeNode child : children) {
            walk(child, nextParents, connection, out);
        }
    }

    private static DiscoveryIndexedRelation toRelation(
                                                       TreeNode node,
                                                       List<TreeNode> parents,
                                                       ConnectionEntity connection) {
        String database = resolveDatabaseLabel(parents, connection.getDbType());
        String name = node.getLabel() != null ? node.getLabel() : "";
        String qualified = database.isBlank() ? name : database + "." + name;
        String connectionLabel = connection.getName() != null ? connection.getName() : connection.getId();
        List<String> tags = extractHashtags(node.getComment());
        String searchText = joinLower(
                name,
                qualified,
                connectionLabel,
                database,
                node.getType(),
                node.getMeta(),
                node.getComment(),
                String.join(" ", tags));
        String id = node.getId() != null && !node.getId().isBlank()
                ? node.getId()
                : connection.getId() + ":" + qualified;
        return new DiscoveryIndexedRelation(
                node.getType(),
                id,
                name,
                qualified,
                connection.getId(),
                connectionLabel,
                database,
                trimOrNull(node.getComment()),
                searchText,
                tags,
                extractColumnPeek(node));
    }

    static List<DiscoveryColumnPeekDto> extractColumnPeek(TreeNode tableOrViewNode) {
        if (tableOrViewNode == null || tableOrViewNode.getChildren() == null) {
            return List.of();
        }
        TreeNode columnsFolder = null;
        for (TreeNode child : tableOrViewNode.getChildren()) {
            if ("columns".equals(child.getType())) {
                columnsFolder = child;
                break;
            }
        }
        if (columnsFolder == null || columnsFolder.getChildren() == null || columnsFolder.getChildren().isEmpty()) {
            return List.of();
        }
        List<DiscoveryColumnPeekDto> out = new ArrayList<>();
        for (TreeNode columnNode : columnsFolder.getChildren()) {
            String columnType = columnNode.getType();
            if (!"column".equals(columnType) && !"primary_key".equals(columnType)) {
                continue;
            }
            String columnName = columnNode.getLabel();
            if (columnName == null || columnName.isBlank()) {
                continue;
            }
            out.add(new DiscoveryColumnPeekDto(columnName.trim(), normalizeColumnType(columnNode.getMeta())));
            if (out.size() >= MAX_COLUMN_PEEK) {
                break;
            }
        }
        return List.copyOf(out);
    }

    private static String normalizeColumnType(String meta) {
        if (meta == null || meta.isBlank()) {
            return null;
        }
        String trimmed = meta.trim();
        String lower = trimmed.toLowerCase(Locale.ROOT);
        if (lower.endsWith(" · pk")) {
            trimmed = trimmed.substring(0, trimmed.length() - 4).trim();
        } else if ("pk".equals(lower)) {
            return null;
        }
        return trimmed.isEmpty() ? null : trimmed;
    }

    static List<String> extractHashtags(String comment) {
        if (comment == null || comment.isBlank()) {
            return List.of();
        }
        LinkedHashSet<String> tags = new LinkedHashSet<>();
        Matcher matcher = HASHTAG.matcher(comment);
        while (matcher.find()) {
            String tag = matcher.group(1).toLowerCase(Locale.ROOT);
            if (!tag.isBlank()) {
                tags.add(tag);
            }
        }
        return List.copyOf(tags);
    }

    private static String resolveDatabaseLabel(List<TreeNode> parents, String dbType) {
        TreeNode database = findType(parents, "database");
        TreeNode schema = findType(parents, "schema");
        if (database == null) {
            return schema != null && schema.getLabel() != null ? schema.getLabel() : "";
        }
        String dbLabel = database.getLabel() != null ? database.getLabel() : "";
        if (DbType.usesCatalogSchemaInstanceKey(dbType) && schema != null && schema.getLabel() != null) {
            return dbLabel + "." + schema.getLabel();
        }
        return dbLabel;
    }

    private static TreeNode findType(List<TreeNode> parents, String type) {
        for (TreeNode parent : parents) {
            if (type.equals(parent.getType())) {
                return parent;
            }
        }
        return null;
    }

    private static String joinLower(String... parts) {
        StringBuilder sb = new StringBuilder();
        for (String part : parts) {
            if (part == null || part.isBlank()) {
                continue;
            }
            if (!sb.isEmpty()) {
                sb.append(' ');
            }
            sb.append(part.toLowerCase(Locale.ROOT));
        }
        return sb.toString();
    }

    private static String trimOrNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
