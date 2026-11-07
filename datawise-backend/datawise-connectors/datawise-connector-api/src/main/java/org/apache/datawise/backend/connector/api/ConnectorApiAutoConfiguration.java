package org.apache.datawise.backend.connector.api;

import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.context.annotation.ComponentScan;

/**
 * Connector API 入口：注册 Registry、JDBC 引擎、Generic JDBC 等 Spring Bean。
 * 可选数据源插件从 {@code config/plugins/*.jar} 加载；classpath AutoConfiguration 为开发/测试备用。
 */
@AutoConfiguration
@ComponentScan(basePackages = {
        "org.apache.datawise.backend.connector",
        "org.apache.datawise.backend.schema",
        "org.apache.datawise.backend.metadata",
        "org.apache.datawise.backend.migration",
        "org.apache.datawise.backend.ddl",
        "org.apache.datawise.backend.dml",
        "org.apache.datawise.backend.ops",
        "org.apache.datawise.backend.sql",
        "org.apache.datawise.backend.jdbc"
})
public class ConnectorApiAutoConfiguration {
}
