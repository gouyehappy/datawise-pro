package org.apache.datawise.backend.connector.api.support;

import org.apache.datawise.backend.domain.TableForeignKeyDetail;
import org.apache.datawise.backend.domain.TableIndexDetail;
import org.apache.datawise.backend.domain.TreeNode;

import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.schema.CatalogSchemaScope;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** 表元数据 DTO 映射与 JDBC 类型格式化工具。 */
public final class TableMetadataSupport {

    private TableMetadataSupport() {
    }

    public static List<TableForeignKeyDetail> mapForeignKeys(List<TreeNode> nodes) {
        List<TableForeignKeyDetail> items = new ArrayList<>();
        for (TreeNode node : nodes) {
            String meta = node.getMeta() != null ? node.getMeta() : "";
            String[] parts = meta.split(" → ");
            String columns = parts.length > 0 ? parts[0].trim() : "";
            String reference = parts.length > 1 ? parts[1].trim() : "";
            String referenceTable = reference;
            String referenceColumns = "";
            int dot = reference.lastIndexOf('.');
            if (dot > 0) {
                referenceTable = reference.substring(0, dot);
                referenceColumns = reference.substring(dot + 1);
            }
            items.add(new TableForeignKeyDetail(node.getLabel(), columns, referenceTable, referenceColumns));
        }
        return items;
    }

    public static List<TableIndexDetail> mapIndexes(List<TreeNode> nodes) {
        List<TableIndexDetail> items = new ArrayList<>();
        for (TreeNode node : nodes) {
            String meta = node.getMeta() != null ? node.getMeta() : "";
            String[] parts = meta.split(" · ", 2);
            boolean unique = parts.length > 0 && "unique".equalsIgnoreCase(parts[0].trim());
            String columns = parts.length > 1 ? parts[1].trim() : "";
            items.add(new TableIndexDetail(node.getLabel(), unique, columns));
        }
        return items;
    }

    public static String formatDataType(String typeName, int columnSize, int decimalDigits) {
        if (typeName == null || typeName.isBlank()) {
            return "";
        }
        String lower = typeName.toLowerCase(Locale.ROOT);
        if (columnSize <= 0 || isLengthlessType(lower)) {
            return typeName;
        }
        if (decimalDigits > 0 && supportsPrecisionScale(lower)) {
            return typeName + "(" + columnSize + "," + decimalDigits + ")";
        }
        return typeName + "(" + columnSize + ")";
    }

    public static String blankToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value;
    }

    public static boolean containsIgnoreCase(String value, String needle) {
        return value != null && value.toLowerCase(Locale.ROOT).contains(needle.toLowerCase(Locale.ROOT));
    }

    public static String resolveCatalog(Connection connection, ConnectionEntity entity, String database) throws SQLException {
        CatalogSchemaScope scope = CatalogSchemaScope.parse(database);
        if (scope.catalog() != null && !scope.catalog().isBlank()) {
            return scope.catalog();
        }
        String configured = entity.getDatabaseName();
        if (configured != null && !configured.isBlank()) {
            return configured;
        }
        String catalog = connection.getCatalog();
        if (catalog != null && !catalog.isBlank()) {
            return catalog;
        }
        String schema = connection.getSchema();
        if (schema != null && !schema.isBlank()) {
            return schema;
        }
        throw new IllegalArgumentException("database is required");
    }

    private static boolean isLengthlessType(String lowerType) {
        return lowerType.contains("int")
                || lowerType.contains("date")
                || lowerType.contains("time")
                || lowerType.contains("text")
                || lowerType.contains("blob")
                || lowerType.contains("bool")
                || lowerType.contains("json");
    }

    private static boolean supportsPrecisionScale(String lowerType) {
        return lowerType.contains("decimal")
                || lowerType.contains("numeric")
                || lowerType.contains("number");
    }
}
