package org.apache.datawise.backend.domain;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class ConnectionConfig {

    private String id;
    private String name;
    private String dbType;
    private String env;
    private String envCustom;
    private String storage;
    private String host;
    private String port;
    private String auth;
    private String user;
    private String password;
    private String url;
    private String database;
    private String sid;
    private String serviceType;
    private String driver;
    private String driverClass;
    private Boolean sshEnabled;
    private String sshHost;
    private String sshPort;
    private String sshUser;
    private String sshPassword;
    private String sshPrivateKey;
    private String sshPassphrase;
    private String jumpPrivateKey;
    private String jumpPassphrase;
    private String advancedConfig;
    /** Community plugin secret-bound values as JSON ({@code {"key":"value"}}); encrypted at rest. */
    private String secrets;
    /** Community plugin id when {@code dbType=plugin}. */
    private String pluginId;
    /** Contribution id of the connection-provider. */
    private String pluginConnectionProvider;
    /** Optional plugin-defined connection type string (e.g. ssh). */
    private String pluginConnectionType;

    public String getServiceType() {
        return serviceType;
    }

    public void setServiceType(String serviceType) {
        this.serviceType = serviceType;
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

    public Boolean getSshEnabled() {
        return sshEnabled;
    }

    public void setSshEnabled(Boolean sshEnabled) {
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

    public String getSecrets() {
        return secrets;
    }

    public void setSecrets(String secrets) {
        this.secrets = secrets;
    }

    public String getSid() {
        return sid;
    }

    public void setSid(String sid) {
        this.sid = sid;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
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

    public String getAuth() {
        return auth;
    }

    public void setAuth(String auth) {
        this.auth = auth;
    }

    public String getUser() {
        return user;
    }

    public void setUser(String user) {
        this.user = user;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }

    public String getDatabase() {
        return database;
    }

    public void setDatabase(String database) {
        this.database = database;
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
}
