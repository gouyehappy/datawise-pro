package org.apache.datawise.backend.model;

/**
 * 联邦视图数据源：单连接 + 库 + 别名。
 */
public class FederatedViewSource {

    private String alias;
    private String connectionId;
    private String connectionLabel;
    private String database;

    public String getAlias() {
        return alias;
    }

    public void setAlias(String alias) {
        this.alias = alias;
    }

    public String getConnectionId() {
        return connectionId;
    }

    public void setConnectionId(String connectionId) {
        this.connectionId = connectionId;
    }

    public String getConnectionLabel() {
        return connectionLabel;
    }

    public void setConnectionLabel(String connectionLabel) {
        this.connectionLabel = connectionLabel;
    }

    public String getDatabase() {
        return database;
    }

    public void setDatabase(String database) {
        this.database = database;
    }
}
