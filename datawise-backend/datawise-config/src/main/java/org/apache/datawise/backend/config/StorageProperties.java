package org.apache.datawise.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Identity metadata storage: {@code file} (default) or {@code jdbc}.
 */
@ConfigurationProperties(prefix = "datawise.storage")
public class StorageProperties {

    /** file | jdbc */
    private String backend = "file";

    private final MetadataDatasource datasource = new MetadataDatasource();

    public String getBackend() {
        return backend;
    }

    public void setBackend(String backend) {
        this.backend = backend != null && !backend.isBlank() ? backend.trim() : "file";
    }

    public boolean isJdbc() {
        return "jdbc".equalsIgnoreCase(getBackend());
    }

    public boolean isFile() {
        return !isJdbc();
    }

    /**
     * True when the metadata JDBC URL points at an in-memory H2 database
     * ({@code h2:mem} or {@code :mem:}), which is not portable across machines.
     */
    public boolean isMemoryH2Metadata() {
        String url = datasource.getJdbcUrl();
        if (url == null || url.isBlank()) {
            return false;
        }
        String normalized = url.toLowerCase();
        return normalized.contains("h2:mem") || normalized.contains(":mem:");
    }

    public MetadataDatasource getDatasource() {
        return datasource;
    }

    public static class MetadataDatasource {

        private String jdbcUrl = "jdbc:h2:mem:datawise_metadata;MODE=PostgreSQL;DB_CLOSE_DELAY=-1";
        private String username = "sa";
        private String password = "";
        private String driverClassName = "org.h2.Driver";
        /** Hikari maximum pool size for the metadata DataSource. */
        private int maximumPoolSize = 10;

        public String getJdbcUrl() {
            return jdbcUrl;
        }

        public void setJdbcUrl(String jdbcUrl) {
            this.jdbcUrl = jdbcUrl;
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

        public String getDriverClassName() {
            return driverClassName;
        }

        public void setDriverClassName(String driverClassName) {
            this.driverClassName = driverClassName;
        }

        public int getMaximumPoolSize() {
            return maximumPoolSize;
        }

        public void setMaximumPoolSize(int maximumPoolSize) {
            this.maximumPoolSize = Math.max(1, maximumPoolSize);
        }
    }
}
