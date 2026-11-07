package org.apache.datawise.backend.schema;

/**
 * JDBC 元数据查询用的 catalog/schema 模式。
 *
 * @param catalogPattern 传给 DatabaseMetaData 的 catalog 参数
 * @param schemaPattern  传给 DatabaseMetaData 的 schema 参数
 * @param displayCatalog 树节点上展示的数据库/Schema 名称
 */
public record SchemaScope(String catalogPattern, String schemaPattern, String displayCatalog) {
}
