package org.apache.datawise.backend.database.table;

import org.apache.datawise.backend.jdbc.error.JdbcConnectionErrors;
import org.apache.datawise.backend.common.TableDataException;
import org.apache.datawise.backend.domain.TableColumnDetail;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.apache.datawise.backend.dml.DmlColumnFilter;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.database.context.ConnectionExecutionContext;

import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 表数据查询/DML 共享：连接上下文解析、列过滤与异常映射。 */
public final class TableDataSupport {

    private TableDataSupport() {
    }

    public record ConnectionContext(ConnectionEntity entity, String database) {
    }

    public static ConnectionContext resolveContext(
            ConnectionExecutionContext connectionContext,
            String tableName,
            String connectionId,
            String database
    ) {
        if (tableName == null || tableName.isBlank()) {
            throw new IllegalArgumentException("tableName is required");
        }
        ConnectionExecutionContext.ResolvedConnectionWithDatabase resolved =
                connectionContext.requireAvailableWithDatabaseForCurrentUser(
                        connectionId,
                        database,
                        "Connection not found: " + connectionId
                );
        return new ConnectionContext(resolved.entity(), resolved.database());
    }

    /**
     * 空白值不写入 INSERT：自增列省略以走 AUTO_INCREMENT，可空列写 NULL，其余有 DEFAULT 的列由数据库填充。
     */
    public static Map<String, Object> normalizeInsertValues(
            TablePropertiesResult properties,
            Map<String, Object> values
    ) {
        List<String> allowed = columnNames(properties);
        Map<String, Object> filtered = DmlColumnFilter.filterKnownColumns(values, allowed);
        Map<String, TableColumnDetail> byName = new LinkedHashMap<>();
        for (TableColumnDetail column : properties.columns()) {
            byName.put(column.name(), column);
        }

        Map<String, Object> normalized = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : filtered.entrySet()) {
            TableColumnDetail column = byName.get(entry.getKey());
            if (column == null) {
                continue;
            }
            Object value = entry.getValue();
            if (isBlankInsertValue(value)) {
                if (column.autoIncrement()) {
                    continue;
                }
                if (column.nullable()) {
                    normalized.put(entry.getKey(), null);
                }
                continue;
            }
            normalized.put(entry.getKey(), value);
        }
        return normalized;
    }

    public static List<String> columnNames(TablePropertiesResult properties) {
        List<String> names = new ArrayList<>();
        if (properties.columns() == null) {
            return names;
        }
        for (TableColumnDetail column : properties.columns()) {
            names.add(column.name());
        }
        return names;
    }

    public static List<String> primaryKeyColumns(TablePropertiesResult properties) {
        List<String> keys = new ArrayList<>();
        if (properties.columns() == null) {
            return keys;
        }
        for (TableColumnDetail column : properties.columns()) {
            if (isPrimaryKeyType(column.keyType())) {
                keys.add(column.name());
            }
        }
        return keys;
    }

    private static boolean isPrimaryKeyType(String keyType) {
        if (keyType == null || keyType.isBlank()) {
            return false;
        }
        String normalized = keyType.trim().toUpperCase(java.util.Locale.ROOT);
        return "PRI".equals(normalized)
                || "PK".equals(normalized)
                || "PRIMARY".equals(normalized)
                || normalized.startsWith("PRIMARY");
    }

    public static TableDataException toTableDataException(
            ConnectionEntity entity,
            SQLException ex,
            String errorCode
    ) {
        return new TableDataException(JdbcConnectionErrors.toUserMessage(entity, ex), errorCode, ex);
    }

    private static boolean isBlankInsertValue(Object value) {
        if (value == null) {
            return true;
        }
        if (value instanceof String text) {
            return text.isBlank();
        }
        return false;
    }
}
