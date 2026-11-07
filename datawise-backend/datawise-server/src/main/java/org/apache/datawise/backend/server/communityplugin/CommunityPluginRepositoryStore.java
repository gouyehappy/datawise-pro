package org.apache.datawise.backend.server.communityplugin;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.ConfigPaths;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginException;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginRepository;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Persists marketplace repository definitions under {@code config/community-plugins/.repositories.json}.
 */
@Service
public class CommunityPluginRepositoryStore {

    private final ConfigDirectoryService configDirectory;
    private final ObjectMapper objectMapper;

    public CommunityPluginRepositoryStore(ConfigDirectoryService configDirectory, ObjectMapper objectMapper) {
        this.configDirectory = configDirectory;
        this.objectMapper = objectMapper;
    }

    public List<CommunityPluginRepository> list() {
        return new ArrayList<>(readDocument().repositories());
    }

    public List<CommunityPluginRepository> replace(List<CommunityPluginRepository> repositories) {
        List<CommunityPluginRepository> normalized = normalize(repositories);
        writeDocument(new RepositoriesDocument(normalized));
        return normalized;
    }

    private List<CommunityPluginRepository> normalize(List<CommunityPluginRepository> repositories) {
        if (repositories == null || repositories.isEmpty()) {
            return List.of();
        }
        Map<String, CommunityPluginRepository> byId = new LinkedHashMap<>();
        for (CommunityPluginRepository repo : repositories) {
            CommunityPluginRepository normalized = normalizeOne(repo);
            byId.put(normalized.id(), normalized);
        }
        return List.copyOf(byId.values());
    }

    private CommunityPluginRepository normalizeOne(CommunityPluginRepository repo) {
        if (repo == null || repo.id() == null || repo.id().isBlank()) {
            throw new CommunityPluginException("Repository id is required");
        }
        String id = repo.id().trim();
        if (!id.matches("^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$")) {
            throw new CommunityPluginException("Invalid repository id: " + id);
        }
        if (repo.url() == null || repo.url().isBlank()) {
            throw new CommunityPluginException("Repository url is required");
        }
        String url = repo.url().trim();
        try {
            URI uri = URI.create(url);
            String scheme = uri.getScheme();
            if (scheme == null || !(scheme.equalsIgnoreCase("https") || scheme.equalsIgnoreCase("http"))) {
                throw new CommunityPluginException("Repository url must use http or https");
            }
        } catch (IllegalArgumentException e) {
            throw new CommunityPluginException("Repository url is invalid");
        }
        String name = repo.name() == null || repo.name().isBlank() ? id : repo.name().trim();
        return new CommunityPluginRepository(id, name, url, repo.enabled());
    }

    private RepositoriesDocument readDocument() {
        Path path = repositoriesPath();
        if (!Files.isRegularFile(path)) {
            return new RepositoriesDocument(List.of());
        }
        try {
            RepositoriesDocument document = objectMapper.readValue(path.toFile(), RepositoriesDocument.class);
            return document == null || document.repositories() == null
                    ? new RepositoriesDocument(List.of())
                    : document;
        } catch (IOException e) {
            throw new CommunityPluginException("Failed to read repositories: " + e.getMessage(), e);
        }
    }

    private void writeDocument(RepositoriesDocument document) {
        try {
            Path path = repositoriesPath();
            Files.createDirectories(Objects.requireNonNull(path.getParent()));
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(path.toFile(), document);
        } catch (IOException e) {
            throw new CommunityPluginException("Failed to write repositories: " + e.getMessage(), e);
        }
    }

    private Path repositoriesPath() {
        return configDirectory.resolve(ConfigPaths.COMMUNITY_PLUGIN_REPOSITORIES);
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record RepositoriesDocument(List<CommunityPluginRepository> repositories) {
        RepositoriesDocument {
            repositories = repositories == null ? List.of() : List.copyOf(repositories);
        }
    }
}
