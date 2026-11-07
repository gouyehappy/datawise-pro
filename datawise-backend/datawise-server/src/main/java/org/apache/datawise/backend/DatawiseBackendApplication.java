package org.apache.datawise.backend;

import org.apache.datawise.backend.config.AuthSecurityProperties;
import org.apache.datawise.backend.config.AuthSessionProperties;
import org.apache.datawise.backend.config.BackupProperties;
import org.apache.datawise.backend.config.CommunityPluginProperties;
import org.apache.datawise.backend.config.EntitlementProperties;
import org.apache.datawise.backend.config.ConnectorDownloadProperties;
import org.apache.datawise.backend.config.ConnectionProbeProperties;
import org.apache.datawise.backend.config.DatawiseConfigProperties;
import org.apache.datawise.backend.config.StorageProperties;
import org.apache.datawise.backend.config.TenancyProperties;
import org.apache.datawise.backend.config.DatawiseQueryProperties;
import org.apache.datawise.backend.config.DatawiseWorkspaceProperties;
import org.apache.datawise.backend.config.SqlRewriteProperties;
import org.apache.datawise.backend.config.ConnectionLifecycleProperties;
import org.apache.datawise.backend.config.ExplorerSchemaProperties;
import org.apache.datawise.backend.config.JdbcPoolProperties;
import org.apache.datawise.backend.config.JdbcDriverMavenProperties;
import org.apache.datawise.backend.config.TableMigrationProperties;
import org.apache.datawise.backend.connector.ssh.SshClientProperties;
import org.apache.datawise.backend.jdbc.ssh.SshTunnelProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication(
        scanBasePackages = {
                "org.apache.datawise.backend",
                "org.apache.datawise.desktop"
        },
        exclude = {
                DataSourceAutoConfiguration.class,
                FlywayAutoConfiguration.class
        }
)
@EnableScheduling
@EnableConfigurationProperties({
        DatawiseQueryProperties.class,
        SqlRewriteProperties.class,
        DatawiseWorkspaceProperties.class,
        DatawiseConfigProperties.class,
        BackupProperties.class,
        EntitlementProperties.class,
        ConnectorDownloadProperties.class,
        TenancyProperties.class,
        StorageProperties.class,
        AuthSessionProperties.class,
        AuthSecurityProperties.class,
        CommunityPluginProperties.class,
        ConnectionProbeProperties.class,
        JdbcPoolProperties.class,
        JdbcDriverMavenProperties.class,
        ConnectionLifecycleProperties.class,
        ExplorerSchemaProperties.class,
        TableMigrationProperties.class,
        SshTunnelProperties.class,
        SshClientProperties.class,
        org.apache.datawise.backend.configstore.connections.ProjectConnectionsProperties.class,
})
public class DatawiseBackendApplication {

    private static final Logger log = LoggerFactory.getLogger(DatawiseBackendApplication.class);

    public static void main(String[] args) {
        String[] springArgs = args;
        if (isDesktopGuiRequested()) {
            try {
                Class<?> launcher = Class.forName("org.apache.datawise.desktop.DesktopUiLauncher");
                Object requested = launcher.getMethod("isGuiRequested").invoke(null);
                if (Boolean.TRUE.equals(requested)) {
                    springArgs = (String[]) launcher.getMethod("prepareAndStart", String[].class)
                            .invoke(null, (Object) args);
                    log.info("desktop GUI started in-process (JetBrains JCEF / jbr_jcef)");
                }
            } catch (ClassNotFoundException e) {
                log.warn("datawise-desktop not on classpath; starting headless server");
            } catch (ReflectiveOperationException e) {
                throw new IllegalStateException("Failed to start desktop GUI: " + e.getMessage(), e);
            }
        }
        SpringApplication.run(DatawiseBackendApplication.class, springArgs);
    }

    private static boolean isDesktopGuiRequested() {
        if (Boolean.parseBoolean(System.getProperty("datawise.gui", "false"))) {
            return true;
        }
        String env = System.getenv("DATAWISE_GUI");
        if (env != null && (env.equalsIgnoreCase("1") || env.equalsIgnoreCase("true"))) {
            return true;
        }
        if (Boolean.parseBoolean(System.getProperty("datawise.packaged", "false"))) {
            return true;
        }
        String packaged = System.getenv("DATAWISE_PACKAGED");
        return packaged != null
                && (packaged.equalsIgnoreCase("1") || packaged.equalsIgnoreCase("true"));
    }
}
