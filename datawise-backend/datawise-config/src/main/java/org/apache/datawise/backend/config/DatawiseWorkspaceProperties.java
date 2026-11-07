package org.apache.datawise.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "datawise.workspace")
public class DatawiseWorkspaceProperties {

    /**
     * SQL 脚本根目录默认值（可被 config/workspace.xml 覆盖）
     */
    private String scriptsDir = "scripts";

    public String getScriptsDir() {
        return scriptsDir;
    }

    public void setScriptsDir(String scriptsDir) {
        this.scriptsDir = scriptsDir != null && !scriptsDir.isBlank() ? scriptsDir.trim() : "scripts";
    }
}
