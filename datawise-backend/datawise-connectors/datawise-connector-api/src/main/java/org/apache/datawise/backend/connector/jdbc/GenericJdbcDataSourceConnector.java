package org.apache.datawise.backend.connector.jdbc;

import org.apache.datawise.backend.common.PluginOwnedDbTypes;
import org.apache.datawise.backend.connector.spi.ConnectorJdbcOperations;
import org.springframework.stereotype.Component;

import java.util.Set;

/**
 * JDBC 回退连接器：未安装专用插件时，对 {@link PluginOwnedDbTypes} 以外的类型提供通用 JDBC 能力。
 * <p>
 * Plugin-owned 类型必须由可选插件 JAR（{@code datawise-connector-*}）提供；
 * 未安装插件时不得回退到 generic，避免无权限操作。
 */
@Component
public class GenericJdbcDataSourceConnector extends AbstractJdbcDataSourceConnector {

    public GenericJdbcDataSourceConnector(ConnectorJdbcOperations jdbc) {
        super("jdbc-generic", 1000, Set.of(), jdbc);
    }

    @Override
    public boolean supports(String dbType) {
        if (dbType == null || dbType.isBlank()) {
            return false;
        }
        return !PluginOwnedDbTypes.contains(dbType);
    }
}
