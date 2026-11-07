package org.apache.datawise.backend.connector.plugin;

import org.apache.datawise.backend.connector.ConnectorPluginContributionHolder;
import org.apache.datawise.backend.connector.ConnectorRegistry;
import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.hook.SqlExecutionHookRunner;
import org.apache.datawise.backend.connector.jdbc.JdbcConnectorOperations;
import org.apache.datawise.backend.connector.spi.ConnectorDialectContributions;
import org.apache.datawise.backend.connector.spi.ConnectorPluginContext;
import org.apache.datawise.backend.domain.ConnectorPluginLoadStatusDto;
import org.apache.datawise.backend.domain.ConnectorPluginReloadResultDto;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Reloads {@code config/plugins} JARs into the live {@link ConnectorRegistry} without a process restart.
 * <p>
 * Plugin JARs are loaded from a runtime copy so the source file under {@code config/plugins}
 * can be deleted without a Windows file lock. {@link #unload()} drops live registry references
 * before closing classloaders.
 */
public class ConnectorPluginRuntime {

    private static final Logger log = LoggerFactory.getLogger(ConnectorPluginRuntime.class);

    public enum Phase {
        PENDING,
        LOADING,
        READY,
        FAILED
    }

    private final ConnectorRegistry connectorRegistry;
    private final ConnectorPluginLoader pluginLoader;
    private final List<DataSourceConnector> classpathConnectors;
    private final JdbcConnectorOperations jdbc;
    private final ConnectorPluginContributionHolder contributionHolder;
    private final SqlExecutionHookRunner sqlExecutionHookRunner;
    private final AtomicReference<Phase> phase = new AtomicReference<>(Phase.PENDING);

    public ConnectorPluginRuntime(
                                  ConnectorRegistry connectorRegistry,
                                  ConnectorPluginLoader pluginLoader,
                                  List<DataSourceConnector> classpathConnectors,
                                  JdbcConnectorOperations jdbc,
                                  ConnectorPluginContributionHolder contributionHolder,
                                  SqlExecutionHookRunner sqlExecutionHookRunner) {
        this.connectorRegistry = connectorRegistry;
        this.pluginLoader = pluginLoader;
        this.classpathConnectors = classpathConnectors != null ? List.copyOf(classpathConnectors) : List.of();
        this.jdbc = jdbc;
        this.contributionHolder = contributionHolder;
        this.sqlExecutionHookRunner = sqlExecutionHookRunner;
    }

    /** Marks READY when plugins were already loaded synchronously at bean creation. */
    public void markReadyIfIdle() {
        phase.compareAndSet(Phase.PENDING, Phase.READY);
    }

    public void markFailed(Throwable error) {
        if (error != null) {
            log.warn("Connector plugin bootstrap failed: {}", error.toString());
        }
        phase.set(Phase.FAILED);
    }

    /**
     * First boot load after {@code ApplicationReady}. Safe to call once from
     * {@link ConnectorPluginBootstrap}; subsequent hot-reloads use {@link #reload()}.
     */
    public ConnectorPluginReloadResultDto bootstrapLoad() {
        phase.set(Phase.LOADING);
        try {
            ConnectorPluginReloadResultDto result = reload();
            phase.set(Phase.READY);
            return result;
        } catch (RuntimeException ex) {
            markFailed(ex);
            throw ex;
        }
    }

    public ConnectorPluginLoadStatusDto status() {
        Phase current = phase.get();
        boolean ready = current == Phase.READY || current == Phase.FAILED;
        return new ConnectorPluginLoadStatusDto(
                current.name(),
                ready,
                pluginLoader.loadedPluginJarNames().size(),
                pluginLoader.loadedJarByConnectorId().size(),
                pluginLoader.failedPluginLoads().size());
    }

    public synchronized ConnectorPluginReloadResultDto reload() {
        if (phase.get() == Phase.PENDING) {
            phase.set(Phase.LOADING);
        }
        ConnectorPluginContext context = new ConnectorPluginContext(jdbc);
        List<DataSourceConnector> pluginConnectors = pluginLoader.loadConnectors(context, contributionHolder);
        ConnectorRegistry merged = ConnectorRegistry.merge(pluginConnectors, classpathConnectors);
        connectorRegistry.replaceAll(merged.all());
        sqlExecutionHookRunner.replaceHooks(pluginLoader.loadedSqlExecutionHooks());
        List<String> ids = pluginLoader.loadedJarByConnectorId().keySet().stream().sorted().toList();
        log.info(
                "Hot-reloaded connector plugins: jars={}, connectors={}",
                pluginLoader.loadedPluginJarNames().size(),
                ids);
        phase.set(Phase.READY);
        return new ConnectorPluginReloadResultDto(
                pluginLoader.loadedPluginJarNames().size(),
                ids,
                pluginLoader.failedPluginLoads());
    }

    /**
     * Drops plugin-backed connectors from the live registry, then closes plugin classloaders.
     * Call before deleting JAR files on Windows so the JVM releases file handles.
     */
    public synchronized void unload() {
        connectorRegistry.replaceAll(classpathConnectors);
        contributionHolder.setContributions(ConnectorDialectContributions.EMPTY);
        sqlExecutionHookRunner.replaceHooks(List.of());
        pluginLoader.unloadAll();
        log.info("Unloaded connector plugins; registry kept {} classpath connector(s)", classpathConnectors.size());
    }
}
