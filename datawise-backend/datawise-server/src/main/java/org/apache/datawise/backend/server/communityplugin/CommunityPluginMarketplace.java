package org.apache.datawise.backend.server.communityplugin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginCatalogExpectation;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginException;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginInstallPolicy;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginInstallResult;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginRepository;
import org.apache.datawise.backend.domain.communityplugin.DwpCodec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.HashSet;
import java.util.Set;

/**
 * Built-in fixture catalog plus optional remote repositories ({@code .repositories.json}).
 * Store installs always use the signed policy.
 */
@Service
public class CommunityPluginMarketplace {

    private static final Logger log = LoggerFactory.getLogger(CommunityPluginMarketplace.class);
    private static final Duration REMOTE_TIMEOUT = Duration.ofSeconds(12);
    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(REMOTE_TIMEOUT)
            // Same SSRF posture as CommunityPluginPackageFetcher: a redirect could
            // bounce a vetted catalog URL at internal hosts; never follow them.
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();

    private final ObjectMapper objectMapper;
    private final CommunityPluginInstaller installer;
    private final CommunityPluginRepositoryStore repositoryStore;
    private final CommunityPluginTrustStore trustStore;

    @org.springframework.beans.factory.annotation.Autowired
    public CommunityPluginMarketplace(
            ObjectMapper objectMapper,
            CommunityPluginInstaller installer,
            CommunityPluginRepositoryStore repositoryStore,
            CommunityPluginTrustStore trustStore
    ) {
        this.objectMapper = objectMapper;
        this.installer = installer;
        this.repositoryStore = repositoryStore;
        this.trustStore = trustStore;
    }

    /** Test helper when trust store wiring is manual. */
    CommunityPluginMarketplace(
            ObjectMapper objectMapper,
            CommunityPluginInstaller installer,
            CommunityPluginRepositoryStore repositoryStore
    ) {
        this(objectMapper, installer, repositoryStore, null);
    }

    public JsonNode catalogs() {
        ObjectNode root = objectMapper.createObjectNode();
        ArrayNode catalogs = root.putArray("catalogs");
        appendCatalogs(objectMapper, catalogs, readFixture(), "builtin", null);
        for (CommunityPluginRepository repo : repositoryStore.list()) {
            if (!repo.enabled()) {
                continue;
            }
            try {
                JsonNode remote = fetchRemoteCatalog(repo.url());
                appendCatalogs(objectMapper, catalogs, remote, "repository", repo.id());
            } catch (Exception e) {
                log.warn("Skip community plugin repository '{}': {}", repo.id(), e.getMessage());
                ObjectNode failed = catalogs.addObject();
                failed.put("id", "repo:" + repo.id());
                failed.put("name", repo.name() != null ? repo.name() : repo.id());
                failed.put("source", "repository");
                failed.put("repositoryId", repo.id());
                failed.put("error", e.getMessage() != null ? e.getMessage() : "fetch failed");
                failed.putArray("entries");
            }
        }
        annotateInstalled(catalogs);
        return root;
    }

    public CommunityPluginInstallResult install(String catalogId, String pluginId) {
        if (catalogId == null || catalogId.isBlank() || pluginId == null || pluginId.isBlank()) {
            throw new CommunityPluginException("catalogId and pluginId are required");
        }
        JsonNode entry = findEntry(catalogId, pluginId);
        String packageUrl = entry.path("packageUrl").asText("");
        if (packageUrl.isBlank()) {
            throw new CommunityPluginException("This catalog entry has no signed package URL yet");
        }
        if (!packageUrl.regionMatches(true, 0, "classpath:", 0, "classpath:".length())) {
            CommunityPluginPackageFetcher.requireHttpUrl(packageUrl);
        }
        byte[] bytes = CommunityPluginPackageFetcher.fetch(packageUrl);
        try {
            DwpCodec.VerifiedPackage verified = DwpCodec.verify(
                    bytes,
                    CommunityPluginInstallPolicy.SIGNED,
                    objectMapper,
                    trustStore != null ? trustStore.publicKeyIndex() : java.util.Map.of()
            );
            CommunityPluginCatalogExpectation.validate(entry, verified);
        } catch (java.io.IOException e) {
            throw new CommunityPluginException("Failed to verify catalog package: " + e.getMessage(), e);
        }
        return installer.installBytes(bytes, CommunityPluginInstallPolicy.SIGNED);
    }

    static void appendCatalogs(
            ObjectMapper mapper,
            ArrayNode out,
            JsonNode root,
            String source,
            String repositoryId
    ) {
        if (root == null || !root.path("catalogs").isArray()) {
            return;
        }
        for (JsonNode catalog : root.path("catalogs")) {
            if (!(catalog instanceof ObjectNode original)) {
                continue;
            }
            ObjectNode copy = original.deepCopy();
            String id = copy.path("id").asText("");
            if (id.isBlank()) {
                continue;
            }
            if ("repository".equals(source) && repositoryId != null && !repositoryId.isBlank()) {
                if (!id.startsWith("repo:")) {
                    copy.put("id", "repo:" + repositoryId + ":" + id);
                }
                copy.put("repositoryId", repositoryId);
            }
            copy.put("source", source);
            out.add(copy);
        }
    }

    private void annotateInstalled(ArrayNode catalogs) {
        Set<String> installed = new HashSet<>();
        installer.listInstalled().forEach(plugin -> installed.add(plugin.manifest().id()));
        for (JsonNode catalog : catalogs) {
            if (!(catalog instanceof ObjectNode catalogObject)) {
                continue;
            }
            ArrayNode entries = catalogObject.withArray("entries");
            for (JsonNode entry : entries) {
                if (!(entry instanceof ObjectNode entryObject)) {
                    continue;
                }
                String id = entryObject.path("id").asText("");
                boolean present = installed.contains(id);
                entryObject.put("status", present ? "installed" : "available");
                String packageUrl = entryObject.path("packageUrl").asText("");
                entryObject.put("installable", !present && !packageUrl.isBlank());
            }
        }
    }

    private JsonNode findEntry(String catalogId, String pluginId) {
        for (JsonNode catalog : catalogs().path("catalogs")) {
            if (!catalogId.equals(catalog.path("id").asText())) {
                continue;
            }
            for (JsonNode entry : catalog.path("entries")) {
                if (pluginId.equals(entry.path("id").asText())) {
                    return entry;
                }
            }
        }
        throw new CommunityPluginException("Catalog entry '" + pluginId + "' was not found");
    }

    private JsonNode readFixture() {
        ClassPathResource resource = new ClassPathResource("community-plugin-catalog.json");
        try (InputStream in = resource.getInputStream()) {
            return objectMapper.readTree(in);
        } catch (IOException e) {
            throw new CommunityPluginException("Marketplace catalog is unavailable", e);
        }
    }

    /** Successful remote catalog fetches, short TTL — the plugin center calls catalogs() often. */
    private record CachedCatalog(JsonNode root, long fetchedAt) {
    }

    private static final long CATALOG_TTL_MS = 45_000L;
    private static final int CATALOG_CACHE_MAX = 8;
    private final java.util.concurrent.ConcurrentHashMap<String, CachedCatalog> catalogCache =
            new java.util.concurrent.ConcurrentHashMap<>();

    JsonNode fetchRemoteCatalog(String rawUrl) {
        URI uri = CommunityPluginPackageFetcher.requireHttpUrl(rawUrl);
        CachedCatalog cached = catalogCache.get(uri.toString());
        if (cached != null && System.currentTimeMillis() - cached.fetchedAt() < CATALOG_TTL_MS) {
            return cached.root();
        }
        HttpRequest request = HttpRequest.newBuilder(uri)
                .timeout(REMOTE_TIMEOUT)
                .header("Accept", "application/json")
                .GET()
                .build();
        try {
            HttpResponse<byte[]> response = HTTP.send(request, HttpResponse.BodyHandlers.ofByteArray());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new CommunityPluginException("Catalog fetch failed: HTTP " + response.statusCode());
            }
            byte[] body = response.body();
            if (body == null || body.length == 0) {
                throw new CommunityPluginException("Catalog fetch returned an empty body");
            }
            if (body.length > 2_000_000) {
                throw new CommunityPluginException("Catalog JSON exceeds 2 MiB");
            }
            JsonNode root = objectMapper.readTree(new ByteArrayInputStream(body));
            if (!root.path("catalogs").isArray()) {
                throw new CommunityPluginException("Catalog JSON must contain a catalogs array");
            }
            if (catalogCache.size() >= CATALOG_CACHE_MAX) {
                catalogCache.clear();
            }
            catalogCache.put(uri.toString(), new CachedCatalog(root, System.currentTimeMillis()));
            return root;
        } catch (CommunityPluginException e) {
            throw e;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new CommunityPluginException("Catalog fetch was interrupted", e);
        } catch (IOException e) {
            throw new CommunityPluginException("Catalog fetch failed: " + e.getMessage(), e);
        }
    }
}
