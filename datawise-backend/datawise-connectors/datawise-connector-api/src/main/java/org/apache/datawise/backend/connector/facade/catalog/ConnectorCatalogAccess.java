package org.apache.datawise.backend.connector.facade.catalog;

import org.apache.datawise.backend.connector.ConnectorRegistry;
import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.catalog.SchemaSession;
import org.apache.datawise.backend.connector.plugin.ConnectorPluginLoader;
import org.apache.datawise.backend.connector.plugin.ConnectorPluginRuntime;
import org.apache.datawise.backend.domain.ConnectionTestResult;
import org.apache.datawise.backend.domain.ConnectorPluginLoadFailure;
import org.apache.datawise.backend.domain.ConnectorPluginLoadStatusDto;
import org.apache.datawise.backend.domain.ConnectorPluginManifest;
import org.apache.datawise.backend.domain.ConnectorPluginReloadResultDto;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Path;
import java.sql.SQLException;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** 连接器解析与 Catalog / 连接测试能力入口。 */
@Component
public class ConnectorCatalogAccess {

    private final ConnectorRegistry connectorRegistry;
    private final ConnectorPluginLoader pluginLoader;
    private final ConnectorPluginRuntime pluginRuntime;

    public ConnectorCatalogAccess(
                                  ConnectorRegistry connectorRegistry,
                                  ConnectorPluginLoader pluginLoader,
                                  ConnectorPluginRuntime pluginRuntime) {
        this.connectorRegistry = connectorRegistry;
        this.pluginLoader = pluginLoader;
        this.pluginRuntime = pluginRuntime;
    }

    public DataSourceConnector resolve(ConnectionEntity entity) {
        return connectorRegistry.resolve(entity);
    }

    public DataSourceConnector resolve(String dbType) {
        return connectorRegistry.resolve(dbType);
    }

    /** All loaded connectors (plugin + classpath), priority-sorted. */
    public List<DataSourceConnector> all() {
        return connectorRegistry.all();
    }

    public boolean supports(String dbType) {
        try {
            return connectorRegistry.resolve(dbType).supports(dbType);
        } catch (IllegalArgumentException ex) {
            return false;
        }
    }

    public List<TreeNode> loadConnectionRoot(ConnectionEntity connection, String pattern) {
        return resolve(connection).catalog().loadConnectionRoot(connection, pattern);
    }

    public boolean supportsSchemaTree(ConnectionEntity connection) {
        return resolve(connection).catalog().supportsSchemaTree();
    }

    public SchemaSession openSchemaSession(ConnectionEntity connection) throws SQLException {
        return resolve(connection).catalog().openSchemaSession(connection);
    }

    public ConnectionTestResult testConnection(ConnectionEntity entity) {
        return resolve(entity).connection().test(entity);
    }

    public ConnectionTestResult pingConnection(ConnectionEntity entity) {
        return resolve(entity).connection().ping(entity);
    }

    public List<String> loadedPluginJarNames() {
        return pluginLoader.loadedPluginJarNames();
    }

    public List<ConnectorPluginLoadFailure> failedPluginLoads() {
        return pluginLoader.failedPluginLoads();
    }

    public Optional<ConnectorPluginManifest> pluginManifest() {
        return pluginLoader.manifest();
    }

    public Optional<ConnectorPluginManifest> reloadPluginManifest() {
        return pluginLoader.reloadManifest();
    }

    public Map<String, String> loadedJarByConnectorId() {
        return pluginLoader.loadedJarByConnectorId();
    }

    public Path pluginsDirectory() {
        return pluginLoader.pluginsDirectory();
    }

    /** Reloads plugin JARs into the live registry (no process restart). */
    public ConnectorPluginReloadResultDto reloadPlugins() {
        return pluginRuntime.reload();
    }

    /** Boot / hot-reload phase for deferred {@code config/plugins} scanning. */
    public ConnectorPluginLoadStatusDto pluginLoadStatus() {
        return pluginRuntime.status();
    }

    /**
     * Drops plugin connectors from the live registry and closes classloaders
     * (required before deleting a JAR on Windows).
     */
    public void unloadPlugins() {
        pluginRuntime.unload();
    }

    /**
     * Deletes a plugin JAR with retries / pending-delete rename (Windows file locks).
     *
     * @return {@code true} if removed or marked pending-delete
     */
    public boolean deletePluginJar(Path jarPath) throws IOException {
        return pluginLoader.deletePluginJar(jarPath);
    }

    /** Deletes JARs under {@code config/plugins/.quarantine/}. */
    public int clearQuarantinedPlugins() throws IOException {
        return pluginLoader.clearQuarantine();
    }
}
