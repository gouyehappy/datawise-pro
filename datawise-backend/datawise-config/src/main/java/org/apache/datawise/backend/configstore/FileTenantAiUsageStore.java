package org.apache.datawise.backend.configstore;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.configstore.io.ConfigFileSupport;
import org.apache.datawise.backend.configstore.io.ConfigPersistence;
import org.apache.datawise.backend.domain.TenantIds;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import java.nio.file.Path;
import java.time.LocalDate;
import java.time.ZoneId;

@Service
@ConditionalOnProperty(prefix = "datawise.storage", name = "backend", havingValue = "file", matchIfMissing = true)
public class FileTenantAiUsageStore implements TenantAiUsageStore {

    private final ConfigDirectoryService configDirectory;
    private final ObjectMapper objectMapper;

    public FileTenantAiUsageStore(ConfigDirectoryService configDirectory, ObjectMapper objectMapper) {
        this.configDirectory = configDirectory;
        this.objectMapper = objectMapper;
    }

    @Override
    public AiUsageSnapshot read(String tenantId) {
        String id = TenantIds.normalizeOrDefault(tenantId);
        Path path = configDirectory.resolve(ConfigPaths.tenantAiUsage(id));
        if (!ConfigFileSupport.exists(path)) {
            return emptyToday();
        }
        try {
            AiUsageSnapshot stored = objectMapper.readValue(path.toFile(), AiUsageSnapshot.class);
            return stored != null ? stored : emptyToday();
        } catch (Exception ex) {
            return emptyToday();
        }
    }

    @Override
    public void write(String tenantId, AiUsageSnapshot usage) {
        String id = TenantIds.normalizeOrDefault(tenantId);
        ConfigPersistence.writeJson(
                configDirectory,
                objectMapper,
                ConfigPaths.tenantAiUsage(id),
                usage != null ? usage : emptyToday());
    }

    private static AiUsageSnapshot emptyToday() {
        return new AiUsageSnapshot(LocalDate.now(ZoneId.systemDefault()).toString(), 0);
    }
}
