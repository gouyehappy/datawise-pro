package org.apache.datawise.backend.security;

import org.apache.datawise.backend.model.ConnectionEntity;

import java.util.List;

/**
 * connections.xml 中数据库/SSH 密码字段加解密
 */
public final class ConnectionSecrets {

    private ConnectionSecrets() {
    }

    public static void decryptAll(List<ConnectionEntity> connections, SecretValueCodec codec) {
        if (connections == null) {
            return;
        }
        for (ConnectionEntity connection : connections) {
            decrypt(connection, codec);
        }
    }

    public static void encryptAll(List<ConnectionEntity> connections, SecretValueCodec codec) {
        if (connections == null) {
            return;
        }
        for (ConnectionEntity connection : connections) {
            encrypt(connection, codec);
        }
    }

    public static void decrypt(ConnectionEntity connection, SecretValueCodec codec) {
        if (connection == null) {
            return;
        }
        connection.setPassword(codec.decryptForUse(connection.getPassword()));
        connection.setSshPassword(codec.decryptForUse(connection.getSshPassword()));
        connection.setSshPrivateKey(codec.decryptForUse(connection.getSshPrivateKey()));
        connection.setSshPassphrase(codec.decryptForUse(connection.getSshPassphrase()));
        connection.setPluginSecrets(codec.decryptForUse(connection.getPluginSecrets()));
    }

    public static void encrypt(ConnectionEntity connection, SecretValueCodec codec) {
        if (connection == null) {
            return;
        }
        connection.setPassword(codec.encryptForStorage(connection.getPassword()));
        connection.setSshPassword(codec.encryptForStorage(connection.getSshPassword()));
        connection.setSshPrivateKey(codec.encryptForStorage(connection.getSshPrivateKey()));
        connection.setSshPassphrase(codec.encryptForStorage(connection.getSshPassphrase()));
        connection.setPluginSecrets(codec.encryptForStorage(connection.getPluginSecrets()));
    }

    /**
     * 统计仍为明文的密码字段数（非空且未加密）
     */
    public static int countPlaintextFields(List<ConnectionEntity> connections, SecretValueCodec codec) {
        if (connections == null) {
            return 0;
        }
        int count = 0;
        for (ConnectionEntity connection : connections) {
            if (isPlaintextSecret(connection.getPassword(), codec)) {
                count += 1;
            }
            if (isPlaintextSecret(connection.getSshPassword(), codec)) {
                count += 1;
            }
            if (isPlaintextSecret(connection.getSshPrivateKey(), codec)) {
                count += 1;
            }
            if (isPlaintextSecret(connection.getSshPassphrase(), codec)) {
                count += 1;
            }
            if (isPlaintextSecret(connection.getPluginSecrets(), codec)) {
                count += 1;
            }
        }
        return count;
    }

    public static boolean isPlaintextSecret(String value, SecretValueCodec codec) {
        if (value == null || value.isBlank()) {
            return false;
        }
        if (codec.isEncrypted(value) || codec.isSecretReference(value)) {
            return false;
        }
        return true;
    }
}
