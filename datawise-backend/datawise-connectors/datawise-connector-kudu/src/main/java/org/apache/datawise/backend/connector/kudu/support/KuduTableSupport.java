package org.apache.datawise.backend.connector.kudu.support;

import org.apache.datawise.backend.common.TableDataException;
import org.apache.datawise.backend.connector.document.DocumentCursorSupport;
import org.apache.datawise.backend.domain.TableColumnDetail;
import org.apache.datawise.backend.domain.TableDataResult;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.schema.SchemaNodeIds;
import org.apache.kudu.ColumnSchema;
import org.apache.kudu.Schema;
import org.apache.kudu.Type;
import org.apache.kudu.client.KuduClient;
import org.apache.kudu.client.KuduScanner;
import org.apache.kudu.client.KuduTable;
import org.apache.kudu.client.KuduException;
import org.apache.kudu.client.RowResult;
import org.apache.kudu.client.RowResultIterator;

import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Reads Kudu table rows and schema metadata for Explorer table data. */
public final class KuduTableSupport {

    private KuduTableSupport() {
    }

    public static TableDataResult fetchTablePage(
            ConnectionEntity entity,
            String database,
            String tableName,
            int offset,
            int limit
    ) {
        if (offset < 0) {
            throw new IllegalArgumentException("offset must be >= 0");
        }
        if (limit <= 0) {
            throw new IllegalArgumentException("limit must be > 0");
        }
        DocumentCursorSupport.requireOffsetInRange(offset);
        String catalog = KuduConnectionSupport.resolveCatalog(database);
        try {
            return KuduClientSupport.withClient(entity, client -> {
                KuduTable table = openTable(client, tableName);
                Schema schema = table.getSchema();
                List<ColumnInfo> columns = toColumnInfos(schema);
                List<Map<String, Object>> columnMaps = toColumnMaps(columns);
                List<Map<String, Object>> rows = new ArrayList<>(limit);
                int skipped = 0;
                boolean hasMore = false;
                KuduScanner.KuduScannerBuilder builder = client.newScannerBuilder(table);
                List<String> projected = columns.stream().map(ColumnInfo::name).toList();
                builder.setProjectedColumnNames(projected);
                KuduScanner scanner = builder.build();
                try {
                    scan:
                    while (scanner.hasMoreRows()) {
                        RowResultIterator iterator = scanner.nextRows();
                        while (iterator.hasNext()) {
                            RowResult row = iterator.next();
                            if (skipped < offset) {
                                skipped++;
                                continue;
                            }
                            if (rows.size() == limit) {
                                hasMore = true;
                                break scan;
                            }
                            rows.add(toRow(row, columns));
                        }
                    }
                } finally {
                    scanner.close();
                }
                String cursorId = hasMore ? DocumentCursorSupport.OFFSET_PREFIX + (offset + limit) : null;
                return new TableDataResult(columnMaps, rows, cursorId, hasMore, offset, limit);
            });
        } catch (TableDataException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new TableDataException(
                    KuduConnectionErrors.toUserMessage(entity, ex),
                    TableDataException.FETCH_FAILED,
                    ex
            );
        }
    }

    public static List<TreeNode> loadColumnNodes(
            ConnectionEntity entity,
            String connectionId,
            String database,
            String tableName
    ) {
        try {
            return KuduClientSupport.withClient(entity, client -> {
                Schema schema = openTable(client, tableName).getSchema();
                return toFieldNodes(toColumnInfos(schema), connectionId, database, tableName);
            });
        } catch (Exception ex) {
            throw new TableDataException(
                    KuduConnectionErrors.toUserMessage(entity, ex),
                    TableDataException.FETCH_FAILED,
                    ex
            );
        }
    }

    public static TablePropertiesResult loadTableProperties(
            ConnectionEntity entity,
            String database,
            String tableName
    ) {
        try {
            return KuduClientSupport.withClient(entity, client -> {
                Schema schema = openTable(client, tableName).getSchema();
                List<ColumnInfo> columns = toColumnInfos(schema);
                return toPropertiesResult(tableName, columns);
            });
        } catch (Exception ex) {
            throw new TableDataException(
                    KuduConnectionErrors.toUserMessage(entity, ex),
                    TableDataException.FETCH_FAILED,
                    ex
            );
        }
    }

    private static KuduTable openTable(KuduClient client, String tableName) throws KuduException {
        if (tableName == null || tableName.isBlank()) {
            throw new IllegalArgumentException("Kudu table name is required");
        }
        return client.openTable(tableName.trim());
    }

    private static List<ColumnInfo> toColumnInfos(Schema schema) {
        List<ColumnInfo> columns = new ArrayList<>(schema.getColumnCount());
        int index = 1;
        for (ColumnSchema column : schema.getColumns()) {
            columns.add(new ColumnInfo(
                    "c" + index++,
                    column.getName(),
                    describeType(column),
                    column.getType(),
                    column.isKey(),
                    column.isNullable()
            ));
        }
        return columns;
    }

    private static String describeType(ColumnSchema column) {
        Type type = column.getType();
        if (type == Type.DECIMAL) {
            return "decimal(" + column.getTypeAttributes().getPrecision()
                    + "," + column.getTypeAttributes().getScale() + ")";
        }
        return type.getName();
    }

    private static List<Map<String, Object>> toColumnMaps(List<ColumnInfo> columns) {
        List<Map<String, Object>> columnMaps = new ArrayList<>(columns.size());
        for (ColumnInfo column : columns) {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("key", column.key());
            map.put("name", column.name());
            map.put("type", column.typeLabel());
            columnMaps.add(map);
        }
        return columnMaps;
    }

    private static Map<String, Object> toRow(RowResult row, List<ColumnInfo> columns) {
        Map<String, Object> values = new LinkedHashMap<>();
        for (ColumnInfo column : columns) {
            values.put(column.key(), readCell(row, column));
        }
        return values;
    }

    private static Object readCell(RowResult row, ColumnInfo column) {
        String columnName = column.name();
        if (row.isNull(columnName)) {
            return null;
        }
        return switch (column.kuduType()) {
            case INT8 -> row.getByte(columnName);
            case INT16 -> row.getShort(columnName);
            case INT32 -> row.getInt(columnName);
            case INT64 -> row.getLong(columnName);
            case BINARY -> Base64.getEncoder().encodeToString(row.getBinaryCopy(columnName));
            case STRING -> row.getString(columnName);
            case BOOL -> row.getBoolean(columnName);
            case FLOAT -> row.getFloat(columnName);
            case DOUBLE -> row.getDouble(columnName);
            case UNIXTIME_MICROS -> row.getTimestamp(columnName).toString();
            case DECIMAL -> row.getDecimal(columnName).toPlainString();
            default -> row.getString(columnName);
        };
    }

    private static List<TreeNode> toFieldNodes(
            List<ColumnInfo> columns,
            String connectionId,
            String database,
            String tableName
    ) {
        List<TreeNode> nodes = new ArrayList<>(columns.size());
        for (ColumnInfo column : columns) {
            TreeNode node = new TreeNode();
            node.setId(SchemaNodeIds.nodeId("col", connectionId, database, tableName, column.name()));
            node.setLabel(column.name());
            node.setType(column.primaryKey() ? "primary_key" : "column");
            node.setMeta(column.typeLabel());
            nodes.add(node);
        }
        return nodes;
    }

    private static TablePropertiesResult toPropertiesResult(String tableName, List<ColumnInfo> columns) {
        List<TableColumnDetail> details = new ArrayList<>(columns.size());
        int ordinal = 1;
        for (ColumnInfo column : columns) {
            details.add(new TableColumnDetail(
                    ordinal++,
                    column.name(),
                    column.typeLabel(),
                    column.nullable(),
                    false,
                    column.primaryKey() ? "PRI" : null,
                    null,
                    null,
                    null
            ));
        }
        return new TablePropertiesResult(
                tableName,
                null,
                null,
                null,
                null,
                null,
                details,
                List.of(),
                List.of()
        );
    }

    private record ColumnInfo(
            String key,
            String name,
            String typeLabel,
            Type kuduType,
            boolean primaryKey,
            boolean nullable
    ) {
    }
}
