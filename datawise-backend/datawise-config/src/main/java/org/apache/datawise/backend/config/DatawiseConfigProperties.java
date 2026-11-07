package org.apache.datawise.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "datawise.config")
public class DatawiseConfigProperties {

    /**
     * 应用配置根目录（相对路径基于 JVM 工作目录）
     */
    private String dir = "config";

    private final Secrets secrets = new Secrets();

    public String getDir() {
        return dir;
    }

    public void setDir(String dir) {
        this.dir = dir != null && !dir.isBlank() ? dir.trim() : "config";
    }

    public Secrets getSecrets() {
        return secrets;
    }

    public static final class Secrets {

        /**
         * 启动时是否将明文密钥批量加密落盘
         */
        private boolean migrateOnStartup = true;

        public boolean isMigrateOnStartup() {
            return migrateOnStartup;
        }

        public void setMigrateOnStartup(boolean migrateOnStartup) {
            this.migrateOnStartup = migrateOnStartup;
        }
    }
}
