package org.apache.datawise.backend.server.pack;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.common.PackEntitlementException;
import org.apache.datawise.backend.common.support.PathSegmentSanitizer;
import org.apache.datawise.backend.config.EntitlementProperties;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.ConfigPaths;
import org.apache.datawise.backend.domain.pack.EntitlementSnapshotDto;
import org.apache.datawise.backend.domain.pack.LicenseDocument;
import org.apache.datawise.backend.domain.pack.PackAuditActions;
import org.apache.datawise.backend.domain.pack.PackDpkCodec;
import org.apache.datawise.backend.domain.pack.PackEd25519;
import org.apache.datawise.backend.domain.pack.PackManifest;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.PublicKey;

/**
 * Verifies and extracts a {@code .dpk} under {@code config/packs/<packId>/}, then marks installed.
 */
@Service
public class PackInstallerService {

    private final EntitlementProperties properties;
    private final ConfigDirectoryService configDirectory;
    private final EntitlementService entitlementService;
    private final PackAuditService auditService;
    private final PackStateStore stateStore;
    private final ObjectMapper objectMapper;
    private final ResourceLoader resourceLoader;
    private final PackModuleRegistry packModuleRegistry;

    public PackInstallerService(
            EntitlementProperties properties,
            ConfigDirectoryService configDirectory,
            EntitlementService entitlementService,
            PackAuditService auditService,
            PackStateStore stateStore,
            ObjectMapper objectMapper,
            ResourceLoader resourceLoader,
            PackModuleRegistry packModuleRegistry
    ) {
        this.properties = properties;
        this.configDirectory = configDirectory;
        this.entitlementService = entitlementService;
        this.auditService = auditService;
        this.stateStore = stateStore;
        this.objectMapper = objectMapper;
        this.resourceLoader = resourceLoader;
        this.packModuleRegistry = packModuleRegistry;
    }

    public EntitlementSnapshotDto installFromPath(String path) {
        if (path == null || path.isBlank()) {
            throw PackEntitlementException.licenseMismatch("dpk path is required");
        }
        Path file = Path.of(path.trim()).toAbsolutePath().normalize();
        if (!Files.isRegularFile(file)) {
            throw PackEntitlementException.licenseMismatch("dpk file not found: " + file);
        }
        String name = file.getFileName().toString().toLowerCase();
        if (!name.endsWith(".dpk")) {
            throw PackEntitlementException.licenseMismatch("file must end with .dpk");
        }
        try {
            byte[] bytes = Files.readAllBytes(file);
            return installBytes(bytes);
        } catch (PackEntitlementException ex) {
            auditService.record(PackAuditActions.LICENSE_TAMPERED, null, ex.getMessage());
            throw ex;
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to read dpk: " + ex.getMessage(), ex);
        }
    }

    public EntitlementSnapshotDto installBytes(byte[] dpkBytes) {
        PackDpkCodec.VerifiedPack verified;
        try {
            PublicKey publicKey = loadPublicKeyOrNull();
            verified = PackDpkCodec.verify(
                    dpkBytes,
                    properties.getSigningSecret(),
                    properties.isAllowUnsigned(),
                    objectMapper,
                    publicKey,
                    properties.isRequireEd25519()
            );
        } catch (PackEntitlementException ex) {
            auditService.record(
                    "PACK_INTEGRITY_FAILED".equals(ex.errorCode())
                            ? PackAuditActions.LICENSE_TAMPERED
                            : PackAuditActions.LICENSE_REJECTED,
                    null,
                    ex.getMessage()
            );
            throw ex;
        }
        PackManifest manifest = verified.manifest();
        PackDpkCodec.requireCoreCompatible(manifest, properties.getCoreVersion());

        // Entitlement must allow install (open / licensed / trial)
        entitlementService.installPack(manifest.packId(), manifest.version());

        String safeId = PathSegmentSanitizer.sanitize(manifest.packId(), "pack");
        Path packRoot = configDirectory.resolve(ConfigPaths.PACKS_DIR).resolve(safeId).normalize();
        Path packsDir = configDirectory.resolve(ConfigPaths.PACKS_DIR).normalize();
        if (!packRoot.startsWith(packsDir)) {
            throw PackEntitlementException.licenseMismatch("Invalid pack install path");
        }
        try {
            if (Files.exists(packRoot)) {
                deleteRecursive(packRoot);
            }
            PackDpkCodec.extractPayload(verified, packRoot);
            String siteId = resolveSiteId();
            try {
                PackDpkCodec.unsealExtracted(
                        packRoot,
                        properties.getSigningSecret(),
                        manifest.packId(),
                        siteId
                );
            } catch (PackEntitlementException ex) {
                auditService.record(PackAuditActions.LICENSE_TAMPERED, manifest.packId(), ex.getMessage());
                deleteRecursive(packRoot);
                throw ex;
            }
            auditService.record(PackAuditActions.PACK_INSTALLED, manifest.packId(), "dpk=" + manifest.version());
            packModuleRegistry.refresh();
            return entitlementService.currentSnapshot();
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to extract dpk: " + ex.getMessage(), ex);
        }
    }

    private String resolveSiteId() {
        return stateStore.readLicense()
                .map(LicenseDocument::siteId)
                .filter(id -> id != null && !id.isBlank())
                .orElse("");
    }

    private PublicKey loadPublicKeyOrNull() {
        String path = properties.getPublicKeyPath();
        if (path == null || path.isBlank()) {
            return null;
        }
        try {
            Path file = Path.of(path);
            if (Files.isRegularFile(file)) {
                return PackEd25519.loadPublicKey(file);
            }
            Resource resource = resourceLoader.getResource(path);
            if (resource.exists()) {
                try (InputStream in = resource.getInputStream()) {
                    return PackEd25519.loadPublicKeyBytes(in.readAllBytes());
                }
            }
            Resource classpath = resourceLoader.getResource("classpath:" + path);
            if (classpath.exists()) {
                try (InputStream in = classpath.getInputStream()) {
                    return PackEd25519.loadPublicKeyBytes(in.readAllBytes());
                }
            }
        } catch (Exception ex) {
            throw PackEntitlementException.licenseMismatch("Failed to load pack public key: " + ex.getMessage());
        }
        throw PackEntitlementException.licenseMismatch("Pack public key not found: " + path);
    }

    private static void deleteRecursive(Path root) throws IOException {
        if (!Files.exists(root)) {
            return;
        }
        try (var walk = Files.walk(root)) {
            walk.sorted((a, b) -> b.compareTo(a)).forEach(path -> {
                try {
                    Files.deleteIfExists(path);
                } catch (IOException ignored) {
                    // best-effort
                }
            });
        }
    }
}
