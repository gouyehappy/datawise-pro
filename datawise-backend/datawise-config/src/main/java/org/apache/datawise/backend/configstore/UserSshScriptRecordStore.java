package org.apache.datawise.backend.configstore;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.model.SshScriptRecord;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Per-user, per-SSH-connection script notes ({@code config/users/{userId}/ssh-script-records/{connectionId}.json}).
 */
@Service
public class UserSshScriptRecordStore {

    private final ConfigDirectoryService configDirectory;
    private final ObjectMapper objectMapper;
    private final ConcurrentHashMap<String, JsonListFile<SshScriptRecord>> cache = new ConcurrentHashMap<>();

    public UserSshScriptRecordStore(ConfigDirectoryService configDirectory, ObjectMapper objectMapper) {
        this.configDirectory = configDirectory;
        this.objectMapper = objectMapper;
    }

    public List<SshScriptRecord> listAll(long userId, String connectionId) {
        return fileFor(userId, connectionId).snapshot();
    }

    public synchronized SshScriptRecord upsert(long userId, String connectionId, SshScriptRecord record) {
        Objects.requireNonNull(record.getId(), "id is required");
        JsonListFile<SshScriptRecord> file = fileFor(userId, connectionId);
        return file.upsert(record, existing -> existing.getId().equals(record.getId()));
    }

    public synchronized void removeById(long userId, String connectionId, String recordId) {
        fileFor(userId, connectionId).removeIf(entry -> recordId.equals(entry.getId()));
    }

    private JsonListFile<SshScriptRecord> fileFor(long userId, String connectionId) {
        String key = TenantScopedConfigSupport.cacheKey(userId) + ":" + connectionId;
        return cache.computeIfAbsent(key, ignored -> new JsonListFile<>(
                configDirectory,
                objectMapper,
                TenantScopedConfigSupport.ensureUserTenantScopeFile(configDirectory, userId, "ssh-script-records", connectionId),
                new TypeReference<>() {
                }));
    }
}
