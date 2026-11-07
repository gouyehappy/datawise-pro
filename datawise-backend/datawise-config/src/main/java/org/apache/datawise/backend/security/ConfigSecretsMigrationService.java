package org.apache.datawise.backend.security;

import org.apache.datawise.backend.configstore.AppConfigStore;
import org.apache.datawise.backend.configstore.ConnectionStore;
import org.springframework.stereotype.Service;

/**
 * 启动时将配置文件中的明文密钥批量加密
 */
@Service
public class ConfigSecretsMigrationService {

    public record MigrationReport(int connectionSecretFields, int llmApiKeys) {

        public boolean migrated() {
            return connectionSecretFields > 0 || llmApiKeys > 0;
        }

        public static MigrationReport none() {
            return new MigrationReport(0, 0);
        }
    }

    private final ConnectionStore connectionStore;
    private final AppConfigStore appConfigStore;

    public ConfigSecretsMigrationService(ConnectionStore connectionStore, AppConfigStore appConfigStore) {
        this.connectionStore = connectionStore;
        this.appConfigStore = appConfigStore;
    }

    public MigrationReport migrateIfNeeded() throws Exception {
        int connectionFields = connectionStore.migratePlaintextSecretsIfNeeded();
        int apiKeys = appConfigStore.migratePlaintextSecretsIfNeeded();
        return new MigrationReport(connectionFields, apiKeys);
    }
}
