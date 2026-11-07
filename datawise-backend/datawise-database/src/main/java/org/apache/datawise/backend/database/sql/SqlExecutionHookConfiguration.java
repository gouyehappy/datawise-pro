package org.apache.datawise.backend.database.sql;

import org.apache.datawise.backend.connector.hook.SqlExecutionHookRunner;
import org.apache.datawise.backend.connector.plugin.ConnectorPluginLoader;
import org.apache.datawise.backend.connector.spi.SqlExecutionHook;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** Merges plugin hooks with built-in sqlparser execution hooks. */
@Configuration
public class SqlExecutionHookConfiguration {

    @Bean
    @Primary
    SqlExecutionHookRunner sqlExecutionHookRunner(
            ConnectorPluginLoader pluginLoader,
            List<SqlExecutionHook> builtinSqlExecutionHooks
    ) {
        List<SqlExecutionHook> hooks = new ArrayList<>();
        if (builtinSqlExecutionHooks != null) {
            hooks.addAll(builtinSqlExecutionHooks);
        }
        hooks.addAll(pluginLoader.loadedSqlExecutionHooks());
        hooks.sort(Comparator.comparingInt(SqlExecutionHook::priority));
        return new SqlExecutionHookRunner(hooks);
    }
}
