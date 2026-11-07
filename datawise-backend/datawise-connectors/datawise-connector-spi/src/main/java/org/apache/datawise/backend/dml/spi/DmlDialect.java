package org.apache.datawise.backend.dml.spi;

import org.apache.datawise.backend.domain.TableDataResult;

import java.util.List;
import java.util.Map;

/**
 * 方言 DML 拼装 SPI。新增 Oracle / SQL Server 等只需新增实现并注册为 Spring Bean。
 */
public interface DmlDialect {

    /** 稳定标识，如 {@code mysql-family}、{@code postgresql}。 */
    String dialectId();

    /** 是否支持该 dbType（小写 canonical id）。 */
    boolean supports(String dbType);

    /** 数值越小优先级越高；同 dbType 多实现时取最小。 */
    default int priority() {
        return 100;
    }

    /** 引用标识符（列名、表名等）。 */
    String quoteIdentifier(String name);

    /** 拼装 schema/database 限定的表名。 */
    String qualifiedTable(String database, String tableName);

    String buildInsert(String database, String tableName, Map<String, Object> values);

    String buildMultiInsert(
                            String database,
                            String tableName,
                            List<Map<String, Object>> columns,
                            List<Map<String, Object>> rows);

    /**
     * Multi-row upsert by primary / unique key.
     * {@code conflictStrategy}: {@code OVERWRITE}, {@code SKIP}, or {@code FAIL}.
     * Default implementations throw unless the dialect overrides.
     */
    default String buildMultiUpsert(
                                    String database,
                                    String tableName,
                                    List<Map<String, Object>> columns,
                                    List<Map<String, Object>> rows,
                                    List<String> keyColumns,
                                    String conflictStrategy) {
        throw new UnsupportedOperationException(
                "Upsert is not supported by dialect " + dialectId());
    }

    String buildUpdate(
                       String database,
                       String tableName,
                       Map<String, Object> setValues,
                       Map<String, Object> keyValues);

    String buildDeleteByPrimaryKey(
                                   String database,
                                   String tableName,
                                   Map<String, Object> primaryKeyValues);

    String buildTruncateTable(String database, String tableName);

    String buildDropTableIfExists(String database, String tableName);

    /** 将 {@link TableDataResult} 各行转为 INSERT 语句（Navicat 风格导出）。 */
    String buildInsertsFromTableData(String database, String tableName, TableDataResult data);
}
