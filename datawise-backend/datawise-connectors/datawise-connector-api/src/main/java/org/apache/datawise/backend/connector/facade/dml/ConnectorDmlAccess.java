package org.apache.datawise.backend.connector.facade.dml;

import org.apache.datawise.backend.domain.TableDataResult;
import org.apache.datawise.backend.dml.DmlColumnFilter;
import org.apache.datawise.backend.dml.DmlDialectRegistry;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * 方言 DML SQL 拼装入口；database 层经 {@link org.apache.datawise.backend.connector.facade.ConnectorFacade} 访问。
 */
@Component
public class ConnectorDmlAccess {

    private final DmlDialectRegistry dmlDialectRegistry;

    public ConnectorDmlAccess(DmlDialectRegistry dmlDialectRegistry) {
        this.dmlDialectRegistry = dmlDialectRegistry;
    }

    public String buildInsert(String dbType, String database, String tableName, Map<String, Object> values) {
        return dmlDialectRegistry.buildInsert(dbType, database, tableName, values);
    }

    public String buildMultiInsert(
                                   String dbType,
                                   String database,
                                   String tableName,
                                   List<Map<String, Object>> columns,
                                   List<Map<String, Object>> rows) {
        return dmlDialectRegistry.buildMultiInsert(dbType, database, tableName, columns, rows);
    }

    public DmlDialectRegistry.PreparedBatchInsert prepareBatchInsert(
                                                                     String dbType,
                                                                     String database,
                                                                     String tableName,
                                                                     List<Map<String, Object>> columns) {
        return dmlDialectRegistry.prepareBatchInsert(dbType, database, tableName, columns);
    }

    public DmlDialectRegistry.PreparedBatchInsert prepareBatchUpsert(
                                                                     String dbType,
                                                                     String database,
                                                                     String tableName,
                                                                     List<Map<String, Object>> columns,
                                                                     List<String> keyColumns,
                                                                     String conflictStrategy) {
        return dmlDialectRegistry.prepareBatchUpsert(
                dbType, database, tableName, columns, keyColumns, conflictStrategy);
    }

    public String buildMultiUpsert(
                                   String dbType,
                                   String database,
                                   String tableName,
                                   List<Map<String, Object>> columns,
                                   List<Map<String, Object>> rows,
                                   List<String> keyColumns,
                                   String conflictStrategy) {
        return dmlDialectRegistry.buildMultiUpsert(
                dbType, database, tableName, columns, rows, keyColumns, conflictStrategy);
    }

    public String buildUpdate(
                              String dbType,
                              String database,
                              String tableName,
                              Map<String, Object> setValues,
                              Map<String, Object> keyValues) {
        return dmlDialectRegistry.buildUpdate(dbType, database, tableName, setValues, keyValues);
    }

    public String buildDeleteByPrimaryKey(
                                          String dbType,
                                          String database,
                                          String tableName,
                                          Map<String, Object> primaryKeyValues) {
        return dmlDialectRegistry.buildDeleteByPrimaryKey(dbType, database, tableName, primaryKeyValues);
    }

    public String buildTruncateTable(String dbType, String database, String tableName) {
        return dmlDialectRegistry.buildTruncateTable(dbType, database, tableName);
    }

    public String buildDropTableIfExists(String dbType, String database, String tableName) {
        return dmlDialectRegistry.buildDropTableIfExists(dbType, database, tableName);
    }

    public String buildInsertsFromTableData(
                                            String dbType,
                                            String database,
                                            String tableName,
                                            TableDataResult data) {
        return dmlDialectRegistry.buildInsertsFromTableData(dbType, database, tableName, data);
    }

    /** 仅保留白名单列（大小写不敏感）。 */
    public Map<String, Object> filterKnownColumns(
                                                  Map<String, Object> values,
                                                  List<String> allowedColumnNames) {
        return DmlColumnFilter.filterKnownColumns(values, allowedColumnNames);
    }
}
