package org.apache.datawise.backend.security;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;

/**
 * 配置文件中的敏感字段编解码。
 * <p>
 * 存储格式：
 * <ul>
 *   <li>{@code dwenc:v1:<base64(iv+ciphertext)>} — AES-GCM with local master key</li>
 *   <li>{@code dwsecret:env:NAME} / {@code dwsecret:file:path} — external secret reference (G5)</li>
 * </ul>
 */
@Service
public class SecretValueCodec {

    private static final Logger log = LoggerFactory.getLogger(SecretValueCodec.class);

    public static final String PREFIX = "dwenc:v1:";

    private final SecretEncryptionService encryptionService;
    private final SecretKey secretKey;
    private final SecretReferenceResolver referenceResolver;
    private volatile boolean decryptFailureLogged;

    @Autowired
    public SecretValueCodec(
                            SecretEncryptionService encryptionService,
                            MasterKeyService masterKeyService,
                            SecretReferenceResolver referenceResolver) {
        this.encryptionService = encryptionService;
        this.secretKey = masterKeyService.secretKey();
        this.referenceResolver = referenceResolver;
    }

    SecretValueCodec(SecretEncryptionService encryptionService, SecretKey secretKey) {
        this(encryptionService, secretKey, null);
    }

    SecretValueCodec(
                     SecretEncryptionService encryptionService,
                     SecretKey secretKey,
                     SecretReferenceResolver referenceResolver) {
        this.encryptionService = encryptionService;
        this.secretKey = secretKey;
        this.referenceResolver = referenceResolver;
    }

    public boolean isEncrypted(String value) {
        return value != null && value.startsWith(PREFIX);
    }

    public boolean isSecretReference(String value) {
        return referenceResolver != null && referenceResolver.isReference(value);
    }

    /**
     * 落盘前加密；已是密文、外部引用或空值则原样返回
     */
    public String encryptForStorage(String plaintext) {
        if (plaintext == null || plaintext.isBlank()) {
            return plaintext;
        }
        if (isEncrypted(plaintext) || isSecretReference(plaintext)) {
            return plaintext;
        }
        return PREFIX + encryptionService.encrypt(plaintext, secretKey);
    }

    /**
     * 读取后解密 / 解析引用；明文旧数据兼容直接返回。
     * <p>
     * 主密钥不匹配或密文损坏时不抛错：返回 {@code null} 并打 warn，避免桌面端
     * 启动时 {@code TenantBootstrapService} 读连接目录整进程崩溃。调用方需按
     * 「密钥不可用」处理（用户重新录入密码）。
     */
    public String decryptForUse(String stored) {
        if (stored == null || stored.isBlank()) {
            return stored;
        }
        if (isSecretReference(stored)) {
            try {
                return referenceResolver.resolve(stored);
            } catch (RuntimeException ex) {
                log.warn("Failed to resolve secret reference; treating field as unavailable: {}", ex.toString());
                return null;
            }
        }
        if (!isEncrypted(stored)) {
            return stored;
        }
        try {
            return encryptionService.decrypt(stored.substring(PREFIX.length()), secretKey);
        } catch (RuntimeException ex) {
            if (!decryptFailureLogged) {
                decryptFailureLogged = true;
                log.warn(
                        "Failed to decrypt secret(s) (wrong DATAWISE_MASTER_KEY / missing .datawise-master-key, "
                                + "or corrupted ciphertext); clearing affected fields so the app can start. "
                                + "Re-enter passwords after startup. Further decrypt failures are suppressed. Cause: {}",
                        ex.toString());
            }
            return null;
        }
    }
}
