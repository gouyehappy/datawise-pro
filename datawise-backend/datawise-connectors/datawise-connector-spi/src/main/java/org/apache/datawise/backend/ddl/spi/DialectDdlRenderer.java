package org.apache.datawise.backend.ddl.spi;

import org.apache.datawise.backend.ddl.DdlRenderOptions;
import org.apache.datawise.backend.metadata.LogicalType;
import org.apache.datawise.backend.metadata.TableDefinition;

/**
 * 方言 DDL 渲染 SPI。新增 Oracle / SQL Server 等只需新增实现并注册为 Spring Bean。
 */
public interface DialectDdlRenderer {

    /** 稳定标识，如 {@code mysql-family}、{@code postgresql}。 */
    String dialectId();

    /** 是否支持该 dbType（小写）。 */
    boolean supports(String dbType);

    /** 数值越小优先级越高；同 dbType 多实现时取最小。 */
    default int priority() {
        return 100;
    }

    String renderCreateTable(TableDefinition definition, DdlRenderOptions options);

    String renderPhysicalType(LogicalType type);
}
