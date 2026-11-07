package org.apache.datawise.backend.configstore.migration;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.ConfigPaths;
import org.apache.datawise.backend.configstore.JsonListFile;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.util.List;
import java.util.Optional;

/** 迁移任务 checkpoint 本地持久化。 */
@Service
public class MigrationJobStore {

    private final ObjectMapper objectMapper;
    private final JsonListFile<MigrationJobEntity> jobs;

    public MigrationJobStore(ConfigDirectoryService configDirectory, ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        this.jobs = new JsonListFile<>(
                configDirectory,
                objectMapper,
                ConfigPaths.MIGRATION_JOBS,
                new TypeReference<List<MigrationJobEntity>>() {
                });
    }

    public Optional<MigrationJobEntity> findById(String id) {
        if (id == null || id.isBlank()) {
            return Optional.empty();
        }
        String normalized = id.trim();
        return jobs.stream()
                .filter(job -> normalized.equals(job.getId()))
                .findFirst()
                .map(this::deepCopy);
    }

    public Optional<MigrationJobEntity> findOwned(long userId, String id) {
        return findById(id).filter(job -> job.getUserId() == userId);
    }

    public MigrationJobEntity requireOwned(long userId, String id) {
        return findOwned(userId, id)
                .orElseThrow(() -> new IllegalArgumentException("Migration job not found: " + id));
    }

    public MigrationJobEntity save(MigrationJobEntity job) {
        jobs.upsert(deepCopy(job), existing -> existing.getId().equals(job.getId()));
        // Return the caller's live reference so the worker keeps mutating the same instance.
        return job;
    }

    public List<MigrationJobEntity> listByUser(long userId) {
        return jobs.stream()
                .filter(job -> job.getUserId() == userId)
                .map(this::deepCopy)
                .toList();
    }

    private MigrationJobEntity deepCopy(MigrationJobEntity job) {
        if (job == null) {
            return null;
        }
        try {
            return objectMapper.readValue(objectMapper.writeValueAsBytes(job), MigrationJobEntity.class);
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to deep-copy migration job " + job.getId(), ex);
        }
    }
}
