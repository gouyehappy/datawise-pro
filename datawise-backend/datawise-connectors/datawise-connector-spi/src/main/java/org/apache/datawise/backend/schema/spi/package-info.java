/**
 * Stable Explorer schema SPIs for JDBC connectors.
 *
 * <h2>Contract (frozen)</h2>
 * New connectors register Spring beans against these interfaces. Do <b>not</b> add
 * per-engine method parameters to SPI signatures — extend {@link org.apache.datawise.backend.schema.spi.ExplorerPageRequest}
 * / {@link org.apache.datawise.backend.schema.spi.ExplorerListRequest} if new inputs are required.
 *
 * <h2>New JDBC connector checklist</h2>
 * <table>
 *   <caption>Beans to register</caption>
 *   <tr><th>Bean</th><th>Interface</th><th>Required</th></tr>
 *   <tr><td>Schema dialect</td><td>{@link org.apache.datawise.backend.schema.SchemaDialect}</td><td>yes</td></tr>
 *   <tr><td>Data source connector</td><td>{@code DataSourceConnector}</td><td>yes</td></tr>
 *   <tr><td>Explorer metadata</td><td>{@link org.apache.datawise.backend.schema.spi.JdbcExplorerMetadataSupport}</td><td>recommended</td></tr>
 *   <tr><td>Fast table listing</td><td>{@link org.apache.datawise.backend.schema.spi.FastTableLister}</td><td>recommended for large schemas</td></tr>
 *   <tr><td>Schema explorer override</td><td>{@link org.apache.datawise.backend.schema.spi.JdbcSchemaExplorer}</td><td>special engines only</td></tr>
 *   <tr><td>Table metadata</td><td>{@code TableMetadataIntrospection}</td><td>recommended</td></tr>
 *   <tr><td>DDL / DML / Ops</td><td>capability SPIs</td><td>as needed</td></tr>
 * </table>
 *
 * <h2>Resolution</h2>
 * Registries select the matching bean with the lowest {@code priority()} among those
 * where {@code supports(dbType)} is true. Paging call sites use {@link org.apache.datawise.backend.schema.spi.ExplorerPageRequest}.
 */
package org.apache.datawise.backend.schema.spi;
