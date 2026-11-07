package org.apache.datawise.backend.jdbc.connection;

import org.apache.datawise.backend.common.support.SecretMaterialDigest;
import org.apache.datawise.backend.model.ConnectionEntity;

/**
 * Builds a stable fingerprint for JDBC pool cache invalidation when connection settings change.
 * Secret fields are SHA-256 digested so plaintext never lives in pool map keys.
 */
public final class JdbcConnectionFingerprint {

    private JdbcConnectionFingerprint() {
    }

    /** Concatenates connection fields that affect JDBC URL, auth and driver selection. */
    public static String of(ConnectionEntity entity) {
        return String.join("|",
                nullToEmpty(entity.getDbType()),
                nullToEmpty(entity.getHost()),
                nullToEmpty(entity.getPort()),
                nullToEmpty(entity.getDatabaseName()),
                nullToEmpty(entity.getJdbcUrl()),
                nullToEmpty(entity.getUsername()),
                SecretMaterialDigest.sha256Hex(nullToEmpty(entity.getPassword())),
                nullToEmpty(entity.getDriver()),
                nullToEmpty(entity.getDriverClass()),
                nullToEmpty(entity.getAuthType()),
                String.valueOf(entity.isSshEnabled()),
                nullToEmpty(entity.getSshHost()),
                nullToEmpty(entity.getSshPort()),
                nullToEmpty(entity.getSshUser()),
                SecretMaterialDigest.sha256Hex(nullToEmpty(entity.getSshPassword())),
                SecretMaterialDigest.sha256Hex(nullToEmpty(entity.getSshPrivateKey())),
                SecretMaterialDigest.sha256Hex(nullToEmpty(entity.getSshPassphrase()))
        );
    }

    private static String nullToEmpty(String value) {
        return value != null ? value : "";
    }
}
