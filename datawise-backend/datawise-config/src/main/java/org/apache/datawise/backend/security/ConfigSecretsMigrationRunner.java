package org.apache.datawise.backend.security;

import org.apache.datawise.backend.config.DatawiseConfigProperties;
import org.apache.datawise.backend.startup.DesktopDeferredStartup;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * 应用启动后执行一次明文密钥迁移
 */
@Component
public class ConfigSecretsMigrationRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(ConfigSecretsMigrationRunner.class);

    private final ConfigSecretsMigrationService migrationService;
    private final DatawiseConfigProperties configProperties;

    public ConfigSecretsMigrationRunner(
                                        ConfigSecretsMigrationService migrationService,
                                        DatawiseConfigProperties configProperties) {
        this.migrationService = migrationService;
        this.configProperties = configProperties;
    }

    @Override
    public void run(ApplicationArguments args) {
        DesktopDeferredStartup.runMaybeAsync("secrets-migrate", this::migrateSync);
    }

    private void migrateSync() {
        if (!configProperties.getSecrets().isMigrateOnStartup()) {
            log.debug("Config secret migration disabled (datawise.config.secrets.migrate-on-startup=false)");
            return;
        }
        try {
            ConfigSecretsMigrationService.MigrationReport report = migrationService.migrateIfNeeded();
            if (report.migrated()) {
                log.info(
                        "Encrypted plaintext config secrets on startup: {} connection field(s), {} LLM apiKey(s)",
                        report.connectionSecretFields(),
                        report.llmApiKeys());
            }
        } catch (Exception ex) {
            log.warn("Config secret migration failed; plaintext secrets may remain on disk: {}", ex.getMessage());
            log.debug("Config secret migration error", ex);
        }
    }
}
