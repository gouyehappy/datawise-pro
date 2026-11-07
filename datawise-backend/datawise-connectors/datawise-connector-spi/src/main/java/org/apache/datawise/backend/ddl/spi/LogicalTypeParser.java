package org.apache.datawise.backend.ddl.spi;

import org.apache.datawise.backend.metadata.LogicalType;

/** 物理 DDL 类型字符串 → {@link LogicalType}（由 {@code connector-xxx} 扩展）。 */
public interface LogicalTypeParser {

    boolean supports(String dbType);

    /** 数值越小优先级越高。 */
    default int priority() {
        return 100;
    }

    LogicalType parse(String physicalType);
}
