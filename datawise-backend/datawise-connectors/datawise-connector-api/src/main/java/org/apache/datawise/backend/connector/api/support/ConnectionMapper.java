package org.apache.datawise.backend.connector.api.support;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.common.support.ConnectionEnvironmentSupport;
import org.apache.datawise.backend.domain.ConnectionConfig;
import org.apache.datawise.backend.model.ConnectionEntity;

public final class ConnectionMapper {

    private ConnectionMapper() {
    }

    public static ConnectionConfig toDto(ConnectionEntity entity) {
        ConnectionEnvironmentSupport.applyToEntity(entity);
        ConnectionConfig config = new ConnectionConfig();
        config.setId(entity.getId());
        config.setName(entity.getName());
        config.setDbType(entity.getDbType());
        config.setEnv(entity.getEnv());
        config.setEnvCustom(entity.getEnvCustom());
        config.setStorage(entity.getStorage());
        config.setHost(entity.getHost());
        config.setPort(entity.getPort());
        config.setAuth(entity.getAuthType());
        config.setUser(entity.getUsername());
        config.setPassword(entity.getPassword());
        config.setUrl(entity.getJdbcUrl());
        config.setDatabase(entity.getDatabaseName());
        config.setSid(entity.getSid());
        config.setServiceType(entity.getServiceType());
        config.setDriver(entity.getDriver());
        config.setDriverClass(entity.getDriverClass());
        config.setSshEnabled(entity.isSshEnabled());
        config.setSshHost(entity.getSshHost());
        config.setSshPort(entity.getSshPort());
        config.setSshUser(entity.getSshUser());
        config.setSshPassword(entity.getSshPassword());
        config.setSshPrivateKey(entity.getSshPrivateKey());
        config.setSshPassphrase(entity.getSshPassphrase());
        config.setJumpPrivateKey(entity.getJumpPrivateKey());
        config.setJumpPassphrase(entity.getJumpPassphrase());
        config.setAdvancedConfig(entity.getAdvancedConfig());
        config.setSecrets(entity.getPluginSecrets());
        config.setPluginId(entity.getPluginId());
        config.setPluginConnectionProvider(entity.getPluginConnectionProvider());
        config.setPluginConnectionType(entity.getPluginConnectionType());
        return config;
    }

    public static void applyDto(ConnectionEntity entity, ConnectionConfig config) {
        if (config.getName() != null) {
            entity.setName(config.getName());
        }
        if (config.getDbType() != null) {
            entity.setDbType(config.getDbType());
        }
        ConnectionEnvironmentSupport.NormalizedEnvironment normalized = ConnectionEnvironmentSupport.normalize(
                config.getEnv(),
                config.getEnvCustom());
        entity.setEnv(normalized.env());
        entity.setEnvCustom(normalized.envCustom());
        entity.setStorage(config.getStorage());
        entity.setHost(config.getHost());
        entity.setPort(config.getPort());
        entity.setAuthType(config.getAuth());
        entity.setUsername(config.getUser());
        if (config.getPassword() != null && !config.getPassword().isBlank()) {
            entity.setPassword(config.getPassword());
        }
        entity.setJdbcUrl(config.getUrl());
        if (config.getDatabase() != null) {
            entity.setDatabaseName(config.getDatabase());
        }
        if (config.getSid() != null) {
            entity.setSid(config.getSid());
        }
        if (config.getServiceType() != null) {
            entity.setServiceType(config.getServiceType());
        }
        if (config.getDriver() != null) {
            entity.setDriver(config.getDriver());
        }
        if (config.getDriverClass() != null) {
            entity.setDriverClass(config.getDriverClass());
        }
        if (config.getSshEnabled() != null) {
            entity.setSshEnabled(config.getSshEnabled());
        }
        if (config.getSshHost() != null) {
            entity.setSshHost(config.getSshHost());
        }
        if (config.getSshPort() != null) {
            entity.setSshPort(config.getSshPort());
        }
        if (config.getSshUser() != null) {
            entity.setSshUser(config.getSshUser());
        }
        if (config.getSshPassword() != null && !config.getSshPassword().isBlank()) {
            entity.setSshPassword(config.getSshPassword());
        }
        if (config.getSshPrivateKey() != null && !config.getSshPrivateKey().isBlank()) {
            entity.setSshPrivateKey(config.getSshPrivateKey());
        }
        if (config.getSshPassphrase() != null && !config.getSshPassphrase().isBlank()) {
            entity.setSshPassphrase(config.getSshPassphrase());
        }
        if (config.getJumpPrivateKey() != null && !config.getJumpPrivateKey().isBlank()) {
            entity.setJumpPrivateKey(config.getJumpPrivateKey());
        }
        if (config.getJumpPassphrase() != null && !config.getJumpPassphrase().isBlank()) {
            entity.setJumpPassphrase(config.getJumpPassphrase());
        }
        if (config.getAdvancedConfig() != null) {
            entity.setAdvancedConfig(config.getAdvancedConfig());
        }
        if (config.getSecrets() != null) {
            entity.setPluginSecrets(config.getSecrets());
        }
        if (config.getPluginId() != null) {
            entity.setPluginId(config.getPluginId());
        }
        if (config.getPluginConnectionProvider() != null) {
            entity.setPluginConnectionProvider(config.getPluginConnectionProvider());
        }
        if (config.getPluginConnectionType() != null) {
            entity.setPluginConnectionType(config.getPluginConnectionType());
        }
    }

    public static ConnectionEntity fromDto(ConnectionConfig config, Long userId, String groupId, String id) {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setId(id);
        entity.setUserId(userId);
        entity.setGroupId(groupId);
        applyDto(entity, config);
        if (entity.getName() == null || entity.getName().isBlank()) {
            entity.setName(config.getHost() != null ? config.getHost() : "connection");
        }
        if (entity.getDbType() == null) {
            entity.setDbType(DbType.MYSQL.id());
        }
        return entity;
    }
}
