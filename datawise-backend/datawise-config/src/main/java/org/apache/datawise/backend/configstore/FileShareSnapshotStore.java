package org.apache.datawise.backend.configstore;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.model.ShareSnapshotEntity;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

/** File-backed share snapshots ({@code config/shares.json}). Always file for MVP. */
@Service
public class FileShareSnapshotStore implements ShareSnapshotStore {

    private final JsonListFile<ShareSnapshotEntity> shares;

    public FileShareSnapshotStore(ConfigDirectoryService configDirectory, ObjectMapper objectMapper) {
        this.shares = new JsonListFile<>(
                configDirectory,
                objectMapper,
                ConfigPaths.SHARES,
                new TypeReference<>() {
                });
    }

    @Override
    public List<ShareSnapshotEntity> listAll() {
        return shares.snapshot();
    }

    @Override
    public Optional<ShareSnapshotEntity> findById(String id) {
        if (id == null || id.isBlank()) {
            return Optional.empty();
        }
        String normalized = id.trim();
        return shares.stream().filter(item -> normalized.equals(item.getId())).findFirst();
    }

    @Override
    public Optional<ShareSnapshotEntity> findByTokenLookup(String tokenLookup) {
        if (tokenLookup == null || tokenLookup.isBlank()) {
            return Optional.empty();
        }
        String normalized = tokenLookup.trim();
        return shares.stream()
                .filter(item -> normalized.equals(item.getTokenLookup()))
                .findFirst();
    }

    @Override
    public ShareSnapshotEntity save(ShareSnapshotEntity entity) {
        return shares.upsert(entity, existing -> existing.getId().equals(entity.getId()));
    }

    @Override
    public void delete(String id) {
        if (id == null || id.isBlank()) {
            return;
        }
        String normalized = id.trim();
        shares.removeIf(existing -> normalized.equals(existing.getId()));
    }
}
