package org.apache.datawise.backend.security;

import org.apache.datawise.backend.common.support.RestrictiveFilePermissions;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * 本地主密钥：优先 {@code DATAWISE_MASTER_KEY}，其次 {@code DATAWISE_MASTER_KEY_FILE}，
 * 否则 {@code config/secrets/.datawise-master-key}（兼容旧路径 {@code config/.datawise-master-key}）。
 * <p>
 * Multi-node / hosted deployments should inject {@link #MASTER_KEY_ENV} (or mount the same key file)
 * so ciphertext stays portable across machines. Cloud profile sets
 * {@code datawise.security.master-key.require-external=true} to refuse auto-generated / co-located keys.
 */
@Service
public class MasterKeyService {

    private static final Logger log = LoggerFactory.getLogger(MasterKeyService.class);

    public static final String MASTER_KEY_ENV = "DATAWISE_MASTER_KEY";
    /** Absolute or relative path to a master-key file outside the config blob directory. */
    public static final String MASTER_KEY_FILE_ENV = "DATAWISE_MASTER_KEY_FILE";
    public static final String MASTER_KEY_FILE = ".datawise-master-key";
    public static final String SECRETS_SUBDIR = "secrets";

    private final SecretKey secretKey;
    private final MasterKeySource source;

    @Autowired
    public MasterKeyService(
                            ConfigDirectoryService configDirectory,
                            @Value("${datawise.security.master-key.require-external:false}") boolean requireExternal) {
        LoadedKey loaded = loadOrCreate(configDirectory);
        if (requireExternal) {
            enforceExternal(loaded);
        }
        this.secretKey = loaded.key();
        this.source = loaded.source();
    }

    /**
     * 测试用：固定密钥
     */
    MasterKeyService(byte[] rawKey) {
        this.secretKey = toSecretKey(rawKey);
        this.source = MasterKeySource.ENV;
    }

    public SecretKey secretKey() {
        return secretKey;
    }

    public MasterKeySource source() {
        return source;
    }

    private static void enforceExternal(LoadedKey loaded) {
        if (loaded.source() == MasterKeySource.ENV || loaded.externalFile()) {
            return;
        }
        throw new IllegalStateException(
                "Cloud/production requires an external master key via "
                        + MASTER_KEY_ENV
                        + " or "
                        + MASTER_KEY_FILE_ENV
                        + " (got source="
                        + loaded.source()
                        + ")");
    }

    private static LoadedKey loadOrCreate(ConfigDirectoryService configDirectory) {
        String env = System.getenv(MASTER_KEY_ENV);
        if (env != null && !env.isBlank()) {
            return new LoadedKey(toSecretKey(decodeKey(env.trim())), MasterKeySource.ENV, false);
        }
        String fileEnv = System.getenv(MASTER_KEY_FILE_ENV);
        if (fileEnv != null && !fileEnv.isBlank()) {
            Path external = Path.of(fileEnv.trim());
            if (!Files.isRegularFile(external)) {
                throw new IllegalStateException(MASTER_KEY_FILE_ENV + " does not point to a file: " + external);
            }
            return new LoadedKey(readKeyFile(external), MasterKeySource.FILE, true);
        }
        Path preferred = configDirectory.resolve(SECRETS_SUBDIR).resolve(MASTER_KEY_FILE);
        Path legacy = configDirectory.resolve(MASTER_KEY_FILE);
        if (Files.isRegularFile(preferred)) {
            warnIfCoLocated(configDirectory, preferred);
            return new LoadedKey(readKeyFile(preferred), MasterKeySource.FILE, false);
        }
        if (Files.isRegularFile(legacy)) {
            log.warn(
                    "Master key is co-located with config ciphertext at {} — prefer {} or {} for new installs",
                    legacy,
                    MASTER_KEY_ENV,
                    MASTER_KEY_FILE_ENV);
            return new LoadedKey(readKeyFile(legacy), MasterKeySource.FILE, false);
        }
        return new LoadedKey(createAndPersist(configDirectory, preferred), MasterKeySource.GENERATED, false);
    }

    private static void warnIfCoLocated(ConfigDirectoryService configDirectory, Path keyPath) {
        Path configRoot = configDirectory.resolve(".").normalize();
        Path keyParent = keyPath.getParent() != null ? keyPath.getParent().normalize() : null;
        if (keyParent != null && keyParent.startsWith(configRoot)) {
            log.warn(
                    "Master key file {} lives under the config directory — set {} or {} to keep the key off the ciphertext volume",
                    keyPath,
                    MASTER_KEY_ENV,
                    MASTER_KEY_FILE_ENV);
        }
    }

    private static SecretKey readKeyFile(Path keyPath) {
        try {
            String encoded = Files.readString(keyPath, StandardCharsets.UTF_8).trim();
            return toSecretKey(decodeKey(encoded));
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to read " + keyPath, ex);
        }
    }

    private static SecretKey createAndPersist(ConfigDirectoryService configDirectory, Path keyPath) {
        byte[] raw = new byte[32];
        new SecureRandom().nextBytes(raw);
        try {
            configDirectory.ensureExists();
            Path parent = keyPath.getParent();
            if (parent != null) {
                Files.createDirectories(parent);
                RestrictiveFilePermissions.applyOwnerOnly(parent);
            }
            Files.writeString(keyPath, Base64.getEncoder().encodeToString(raw), StandardCharsets.UTF_8);
            RestrictiveFilePermissions.applyOwnerOnly(keyPath);
            log.info(
                    "Generated master key at {} (subdir under config). Prefer {} / {} for production.",
                    keyPath,
                    MASTER_KEY_ENV,
                    MASTER_KEY_FILE_ENV);
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to create " + keyPath, ex);
        }
        return toSecretKey(raw);
    }

    private static byte[] decodeKey(String encoded) {
        byte[] raw = Base64.getDecoder().decode(encoded);
        if (raw.length != 32) {
            throw new IllegalStateException("Master key must be 32 bytes (AES-256), got " + raw.length);
        }
        return raw;
    }

    private static SecretKey toSecretKey(byte[] raw) {
        if (raw.length != 32) {
            throw new IllegalArgumentException("Master key must be 32 bytes");
        }
        return new SecretKeySpec(raw, "AES");
    }

    private record LoadedKey(SecretKey key, MasterKeySource source, boolean externalFile) {
    }
}
