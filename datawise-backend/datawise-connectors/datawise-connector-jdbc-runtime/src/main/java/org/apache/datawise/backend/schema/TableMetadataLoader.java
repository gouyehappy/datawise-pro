package org.apache.datawise.backend.schema;

import org.apache.datawise.backend.domain.TableRelationEdge;
import org.apache.datawise.backend.domain.TreeNode;

import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * 基于 JDBC DatabaseMetaData 读取表级元数据（列 / 主外键 / 索引）。
 * 各数据库差异通过 {@link SchemaDialect} 提供的 catalog/schema 模式消化。
 */
public final class TableMetadataLoader {

    private TableMetadataLoader() {
    }

    public static Set<String> loadPrimaryKeyColumnNames(
            DatabaseMetaData meta,
            SchemaScope scope,
            String tableName
    ) throws SQLException {
        Set<String> primaryKeys = new HashSet<>();
        try (ResultSet rs = meta.getPrimaryKeys(scope.catalogPattern(), scope.schemaPattern(), tableName)) {
            while (rs.next()) {
                String columnName = rs.getString("COLUMN_NAME");
                if (columnName != null && !columnName.isBlank()) {
                    primaryKeys.add(columnName.toLowerCase(Locale.ROOT));
                }
            }
        }
        return primaryKeys;
    }

    public static List<TreeNode> loadPrimaryKeyNodes(
            DatabaseMetaData meta,
            String connectionId,
            String catalog,
            String tableName,
            SchemaScope scope
    ) throws SQLException {
        Map<String, List<String>> grouped = new LinkedHashMap<>();
        try (ResultSet rs = meta.getPrimaryKeys(scope.catalogPattern(), scope.schemaPattern(), tableName)) {
            while (rs.next()) {
                String keyName = rs.getString("PK_NAME");
                if (keyName == null || keyName.isBlank()) {
                    keyName = "PRIMARY";
                }
                String columnName = rs.getString("COLUMN_NAME");
                if (columnName == null || columnName.isBlank()) {
                    continue;
                }
                grouped.computeIfAbsent(keyName, ignored -> new ArrayList<>())
                        .add(columnName);
            }
        }

        List<TreeNode> nodes = new ArrayList<>();
        for (Map.Entry<String, List<String>> entry : grouped.entrySet()) {
            TreeNode pk = new TreeNode();
            pk.setId(SchemaNodeIds.nodeId("pk", connectionId, catalog, tableName, entry.getKey()));
            pk.setLabel(entry.getKey());
            pk.setType("primary_key");
            pk.setMeta(String.join(", ", entry.getValue()));
            nodes.add(pk);
        }
        return nodes;
    }

    public static List<TreeNode> loadForeignKeyNodes(
            DatabaseMetaData meta,
            String connectionId,
            String catalog,
            String tableName,
            SchemaScope scope
    ) throws SQLException {
        List<TreeNode> foreignKeys = new ArrayList<>();
        try (ResultSet rs = meta.getImportedKeys(scope.catalogPattern(), scope.schemaPattern(), tableName)) {
            while (rs.next()) {
                String fkColumn = rs.getString("FKCOLUMN_NAME");
                String pkTable = rs.getString("PKTABLE_NAME");
                String pkColumn = rs.getString("PKCOLUMN_NAME");
                String fkName = rs.getString("FK_NAME");
                if (fkColumn == null || pkTable == null || pkColumn == null) {
                    continue;
                }
                TreeNode fk = new TreeNode();
                String label = fkName != null && !fkName.isBlank() ? fkName : fkColumn;
                fk.setId(SchemaNodeIds.nodeId("fk", connectionId, catalog, tableName, label, fkColumn, pkTable, pkColumn));
                fk.setLabel(label);
                fk.setType("foreign_key");
                fk.setMeta(fkColumn + " → " + pkTable + "." + pkColumn);
                foreignKeys.add(fk);
            }
        }
        return foreignKeys;
    }

    public static List<TableRelationEdge> loadImportedRelationEdges(
            DatabaseMetaData meta,
            SchemaScope scope,
            String tableName
    ) throws SQLException {
        try (ResultSet rs = meta.getImportedKeys(scope.catalogPattern(), scope.schemaPattern(), tableName)) {
            return groupRelationEdges(rs);
        }
    }

    public static List<TableRelationEdge> loadExportedRelationEdges(
            DatabaseMetaData meta,
            SchemaScope scope,
            String tableName
    ) throws SQLException {
        try (ResultSet rs = meta.getExportedKeys(scope.catalogPattern(), scope.schemaPattern(), tableName)) {
            return groupRelationEdges(rs);
        }
    }

    private static List<TableRelationEdge> groupRelationEdges(ResultSet rs) throws SQLException {
        Map<String, RelationAccumulator> grouped = new LinkedHashMap<>();
        while (rs.next()) {
            String fkTable = rs.getString("FKTABLE_NAME");
            String fkColumn = rs.getString("FKCOLUMN_NAME");
            String pkTable = rs.getString("PKTABLE_NAME");
            String pkColumn = rs.getString("PKCOLUMN_NAME");
            String fkName = rs.getString("FK_NAME");
            if (fkTable == null || fkColumn == null || pkTable == null || pkColumn == null) {
                continue;
            }
            short keySeq = 1;
            try {
                keySeq = rs.getShort("KEY_SEQ");
                if (keySeq <= 0) {
                    keySeq = 1;
                }
            } catch (SQLException ignored) {
                // some drivers omit KEY_SEQ
            }
            String constraintName = fkName != null && !fkName.isBlank() ? fkName : fkColumn;
            String groupKey = constraintName + "|" + fkTable + "|" + pkTable;
            RelationAccumulator acc = grouped.computeIfAbsent(groupKey, ignored -> new RelationAccumulator(
                    constraintName,
                    fkTable,
                    pkTable
            ));
            acc.sourceColumns.put(keySeq, fkColumn);
            acc.targetColumns.put(keySeq, pkColumn);
        }
        return grouped.values().stream()
                .sorted(Comparator.comparing(acc -> acc.constraintName.toLowerCase(Locale.ROOT)))
                .map(RelationAccumulator::toEdge)
                .toList();
    }

    public static List<TreeNode> loadIndexNodes(
            DatabaseMetaData meta,
            String connectionId,
            String catalog,
            String tableName,
            SchemaScope scope
    ) throws SQLException {
        Map<String, IndexAccumulator> grouped = new HashMap<>();
        try (ResultSet rs = meta.getIndexInfo(scope.catalogPattern(), scope.schemaPattern(), tableName, false, false)) {
            while (rs.next()) {
                String indexName = rs.getString("INDEX_NAME");
                if (indexName == null || indexName.isBlank()) {
                    continue;
                }
                if ("PRIMARY".equalsIgnoreCase(indexName)) {
                    continue;
                }
                String columnName = rs.getString("COLUMN_NAME");
                if (columnName == null || columnName.isBlank()) {
                    continue;
                }
                short ordinal = rs.getShort("ORDINAL_POSITION");
                boolean nonUnique = rs.getBoolean("NON_UNIQUE");
                IndexAccumulator acc = grouped.computeIfAbsent(indexName, ignored -> new IndexAccumulator(indexName, nonUnique));
                acc.columns.put(ordinal, columnName);
            }
        }

        return grouped.values().stream()
                .sorted(Comparator.comparing(acc -> acc.name.toLowerCase(Locale.ROOT)))
                .map(acc -> toIndexNode(acc, connectionId, catalog, tableName))
                .toList();
    }

    private static TreeNode toIndexNode(IndexAccumulator acc, String connectionId, String catalog, String tableName) {
        List<String> columns = acc.columns.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .map(Map.Entry::getValue)
                .toList();
        TreeNode index = new TreeNode();
        index.setId(SchemaNodeIds.nodeId("index", connectionId, catalog, tableName, acc.name));
        index.setLabel(acc.name);
        index.setType("index");
        String kind = acc.nonUnique ? "non-unique" : "unique";
        index.setMeta(kind + " · " + String.join(", ", columns));
        return index;
    }

    private static final class IndexAccumulator {
        private final String name;
        private final boolean nonUnique;
        private final Map<Short, String> columns = new HashMap<>();

        private IndexAccumulator(String name, boolean nonUnique) {
            this.name = name;
            this.nonUnique = nonUnique;
        }
    }

    private static final class RelationAccumulator {
        private final String constraintName;
        private final String sourceTable;
        private final String targetTable;
        private final Map<Short, String> sourceColumns = new TreeMap<>();
        private final Map<Short, String> targetColumns = new TreeMap<>();

        private RelationAccumulator(String constraintName, String sourceTable, String targetTable) {
            this.constraintName = constraintName;
            this.sourceTable = sourceTable;
            this.targetTable = targetTable;
        }

        private TableRelationEdge toEdge() {
            return new TableRelationEdge(
                    constraintName,
                    sourceTable,
                    String.join(", ", sourceColumns.values()),
                    targetTable,
                    String.join(", ", targetColumns.values())
            );
        }
    }
}
