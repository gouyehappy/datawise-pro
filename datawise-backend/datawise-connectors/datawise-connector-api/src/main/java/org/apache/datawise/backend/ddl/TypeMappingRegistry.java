package org.apache.datawise.backend.ddl;

import org.apache.datawise.backend.metadata.LogicalType;

/**
 * 跨库类型映射注册表。新增源/目标库对时扩展实现即可。
 */
public interface TypeMappingRegistry {

    LogicalType map(LogicalType sourceType, String sourceDbType, String targetDbType);

    /** 跨方言映射警告码（如 enumSetDowngraded），同方言返回 null。 */
    default String mappingWarning(LogicalType sourceType, String sourceDbType, String targetDbType) {
        return null;
    }
}
