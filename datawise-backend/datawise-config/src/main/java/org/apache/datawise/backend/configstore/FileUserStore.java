package org.apache.datawise.backend.configstore;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.model.UserEntity;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Objects;
import java.util.Optional;

@Service
@ConditionalOnProperty(prefix = "datawise.storage", name = "backend", havingValue = "file", matchIfMissing = true)
public class FileUserStore implements UserStore {

    private final JsonListFile<UserEntity> users;

    public FileUserStore(ConfigDirectoryService configDirectory, ObjectMapper objectMapper) {
        this.users = new JsonListFile<>(
                configDirectory,
                objectMapper,
                ConfigPaths.USERS,
                new TypeReference<List<UserEntity>>() {
                });
    }

    @Override
    public Optional<UserEntity> findById(Long id) {
        if (id == null) {
            return Optional.empty();
        }
        return users.stream()
                .filter(user -> id.equals(user.getId()))
                .findFirst();
    }

    @Override
    public synchronized UserEntity saveUser(UserEntity user) {
        Objects.requireNonNull(user.getId(), "id is required");
        return users.upsert(user, existing -> existing.getId().equals(user.getId()));
    }

    @Override
    public Optional<UserEntity> findByUsername(String username) {
        if (username == null || username.isBlank()) {
            return Optional.empty();
        }
        String normalized = username.trim();
        return users.stream()
                .filter(user -> normalized.equalsIgnoreCase(user.getUsername()))
                .findFirst();
    }

    @Override
    public List<UserEntity> listRegisteredUsers() {
        return users.stream()
                .filter(user -> user != null && !user.isGuest())
                .toList();
    }

    @Override
    public List<UserEntity> listAllUsers() {
        return users.stream()
                .filter(user -> user != null)
                .toList();
    }
}
