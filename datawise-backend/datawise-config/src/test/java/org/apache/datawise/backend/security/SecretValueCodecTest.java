package org.apache.datawise.backend.security;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import javax.crypto.spec.SecretKeySpec;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SecretValueCodecTest {

    private final SecretValueCodec codec = SecretTestSupport.testCodec();

    @TempDir
    Path temp;

    @Test
    void encryptsAndDecryptsRoundTrip() {
        String encrypted = codec.encryptForStorage("sk-secret-key");
        assertTrue(codec.isEncrypted(encrypted));
        assertEquals("sk-secret-key", codec.decryptForUse(encrypted));
    }

    @Test
    void wrongMasterKeyClearsFieldInsteadOfCrashingStartup() {
        String encrypted = codec.encryptForStorage("db-password");
        byte[] otherKey = new byte[32];
        Arrays.fill(otherKey, (byte) 3);
        SecretValueCodec other = new SecretValueCodec(new SecretEncryptionService(), new SecretKeySpec(otherKey, "AES"));
        assertNull(other.decryptForUse(encrypted));
    }

    @Test
    void leavesPlaintextLegacyValuesReadable() {
        assertEquals("legacy-plain", codec.decryptForUse("legacy-plain"));
        assertFalse(codec.isEncrypted("legacy-plain"));
    }

    @Test
    void doesNotDoubleEncrypt() {
        String once = codec.encryptForStorage("token");
        String twice = codec.encryptForStorage(once);
        assertEquals(once, twice);
    }

    @Test
    void leavesSecretReferencesUnencryptedAndResolvesFile() throws Exception {
        Path secrets = temp.resolve("secrets");
        Files.createDirectories(secrets);
        Files.writeString(secrets.resolve("pwd.txt"), "from-file");
        SecretValueCodec withRefs = SecretTestSupport.testCodec(temp);
        String ref = "dwsecret:file:secrets/pwd.txt";
        assertEquals(ref, withRefs.encryptForStorage(ref));
        assertTrue(withRefs.isSecretReference(ref));
        assertFalse(withRefs.isEncrypted(ref));
        assertEquals("from-file", withRefs.decryptForUse(ref));
    }
}
