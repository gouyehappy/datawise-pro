package org.apache.datawise.backend.model;

import java.time.Instant;

public class ConnectionEntity {

    private String id;

    private Long userId;

    /** 所属租户；缺失时按 default 处理。 */
    private String tenantId;

    private String groupId;

    /** 所属项目；缺失时按 {@code proj_default} 处理。 */
    private String projectId;

    /**
     * 额外共享到的项目（不含主键 {@link #projectId}）；默认空 = 单属。
     */
    private java.util.List<String> sharedProjectIds = new java.util.ArrayList<>();

    private String name;

    private String dbType;

    private String env;

    private String envCustom;

    private String storage;

    private String host;

    private String port;

    private String authType;

    private String username;

    private String password;

    private String jdbcUrl;

    private String serviceType;

    private String sid;

    private String driver;

    private String driverClass;

    private String databaseName;

    private boolean sshEnabled = false;

    private String sshHost;

    private String sshPort;

    private String sshUser;

    private String sshPassword;

    private String sshPrivateKey;

    private String sshPassphrase;

    /** Jump-host private key when {@code dbType=ssh} and {@link #sshEnabled} (target key stays in {@link #sshPrivateKey}). */
    private String jumpPrivateKey;

    private String jumpPassphrase;

    private String advancedConfig;

    /**
     * Community plugin secret-bound form values as JSON ({@code {"key":"value"}}).
     * Encrypted at rest by {@link org.apache.datawise.backend.security.ConnectionSecrets}
     * like the other secret fields; kept out of {@link #advancedConfig} which is
     * plaintext configuration.
     */
    private String pluginSecrets;

    /** Community plugin id when {@code dbType=plugin}. */
    private String pluginId;

    private String pluginConnectionProvider;

    private String pluginConnectionType;

    private int sortOrder = 0;

    private Instant createdAt;

    private Instant updatedAt;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public String getTenantId() {
        return tenantId;
    }

    public void setTenantId(String tenantId) {
        this.tenantId = tenantId;
    }

    public String getGroupId() {
        return groupId;
    }

    public void setGroupId(String groupId) {
        this.groupId = groupId;
    }

    public String getProjectId() {
        return projectId;
    }

    public void setProjectId(String projectId) {
        this.projectId = projectId;
    }

    public java.util.List<String> getSharedProjectIds() {
        if (sharedProjectIds == null) {
            sharedProjectIds = new java.util.ArrayList<>();
        }
        return sharedProjectIds;
    }

    public void setSharedProjectIds(java.util.List<String> sharedProjectIds) {
        this.sharedProjectIds = sharedProjectIds != null
                ? new java.util.ArrayList<>(sharedProjectIds)
                : new java.util.ArrayList<>();
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDbType() {
        return dbType;
    }

    public void setDbType(String dbType) {
        this.dbType = dbType;
    }

    public String getEnv() {
        return env;
    }

    public void setEnv(String env) {
        this.env = env;
    }

    public String getEnvCustom() {
        return envCustom;
    }

    public void setEnvCustom(String envCustom) {
        this.envCustom = envCustom;
    }

    public String getStorage() {
        return storage;
    }

    public void setStorage(String storage) {
        this.storage = storage;
    }

    public String getHost() {
        return host;
    }

    public void setHost(String host) {
        this.host = host;
    }

    public String getPort() {
        return port;
    }

    public void setPort(String port) {
        this.port = port;
    }

    public String getAuthType() {
        return authType;
    }

    public void setAuthType(String authType) {
        this.authType = authType;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    public String getJdbcUrl() {
        return jdbcUrl;
    }

    public void setJdbcUrl(String jdbcUrl) {
        this.jdbcUrl = jdbcUrl;
    }

    public String getServiceType() {
        return serviceType;
    }

    public void setServiceType(String serviceType) {
        this.serviceType = serviceType;
    }

    public String getSid() {
        return sid;
    }

    public void setSid(String sid) {
        this.sid = sid;
    }

    public String getDriver() {
        return driver;
    }

    public void setDriver(String driver) {
        this.driver = driver;
    }

    public String getDriverClass() {
        return driverClass;
    }

    public void setDriverClass(String driverClass) {
        this.driverClass = driverClass;
    }

    public String getDatabaseName() {
        return databaseName;
    }

    public void setDatabaseName(String databaseName) {
        this.databaseName = databaseName;
    }

    public boolean isSshEnabled() {
        return sshEnabled;
    }

    public void setSshEnabled(boolean sshEnabled) {
        this.sshEnabled = sshEnabled;
    }

    public String getSshHost() {
        return sshHost;
    }

    public void setSshHost(String sshHost) {
        this.sshHost = sshHost;
    }

    public String getSshPort() {
        return sshPort;
    }

    public void setSshPort(String sshPort) {
        this.sshPort = sshPort;
    }

    public String getSshUser() {
        return sshUser;
    }

    public void setSshUser(String sshUser) {
        this.sshUser = sshUser;
    }

    public String getSshPassword() {
        return sshPassword;
    }

    public void setSshPassword(String sshPassword) {
        this.sshPassword = sshPassword;
    }

    public String getSshPrivateKey() {
        return sshPrivateKey;
    }

    public void setSshPrivateKey(String sshPrivateKey) {
        this.sshPrivateKey = sshPrivateKey;
    }

    public String getSshPassphrase() {
        return sshPassphrase;
    }

    public void setSshPassphrase(String sshPassphrase) {
        this.sshPassphrase = sshPassphrase;
    }

    public String getJumpPrivateKey() {
        return jumpPrivateKey;
    }

    public void setJumpPrivateKey(String jumpPrivateKey) {
        this.jumpPrivateKey = jumpPrivateKey;
    }

    public String getJumpPassphrase() {
        return jumpPassphrase;
    }

    public void setJumpPassphrase(String jumpPassphrase) {
        this.jumpPassphrase = jumpPassphrase;
    }

    public String getAdvancedConfig() {
        return advancedConfig;
    }

    public void setAdvancedConfig(String advancedConfig) {
        this.advancedConfig = advancedConfig;
    }

    public String getPluginSecrets() {
        return pluginSecrets;
    }

    public void setPluginSecrets(String pluginSecrets) {
        this.pluginSecrets = pluginSecrets;
    }

    public String getPluginId() {
        return pluginId;
    }

    public void setPluginId(String pluginId) {
        this.pluginId = pluginId;
    }

    public String getPluginConnectionProvider() {
        return pluginConnectionProvider;
    }

    public void setPluginConnectionProvider(String pluginConnectionProvider) {
        this.pluginConnectionProvider = pluginConnectionProvider;
    }

    public String getPluginConnectionType() {
        return pluginConnectionType;
    }

    public void setPluginConnectionType(String pluginConnectionType) {
        this.pluginConnectionType = pluginConnectionType;
    }

    public int getSortOrder() {
        return sortOrder;
    }

    public void setSortOrder(int sortOrder) {
        this.sortOrder = sortOrder;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
