package org.apache.datawise.backend.domain.pack;

import org.junit.jupiter.api.Test;

import javax.crypto.SecretKey;

import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PackSealedCryptoTest {

    @Test
    void roundTrip() {
        SecretKey key = PackSealedCrypto.deriveKey("secret", PackIds.AI, "site-1");
        byte[] plain = "module bytes".getBytes(StandardCharsets.UTF_8);
        byte[] sealed = PackSealedCrypto.seal(plain, key);
        assertTrue(new String(sealed, 0, 7, StandardCharsets.US_ASCII).startsWith("DWSEAL"));
        assertArrayEquals(plain, PackSealedCrypto.unseal(sealed, key));
    }

    @Test
    void wrongSiteCannotUnseal() {
        SecretKey a = PackSealedCrypto.deriveKey("secret", PackIds.AI, "site-a");
        SecretKey b = PackSealedCrypto.deriveKey("secret", PackIds.AI, "site-b");
        byte[] sealed = PackSealedCrypto.seal("x".getBytes(StandardCharsets.UTF_8), a);
        assertThrows(Exception.class, () -> PackSealedCrypto.unseal(sealed, b));
    }

    @Test
    void sealedSuffixHelpers() {
        assertTrue(PackSealedCrypto.isSealedEntryName("backend/module.class.sealed"));
        assertFalse(PackSealedCrypto.isSealedEntryName("manifest.json"));
        assertEqualsPath(
                "backend/module.class",
                PackSealedCrypto.stripSealedSuffix("backend/module.class.sealed"));
    }

    private static void assertEqualsPath(String expected, String actual) {
        org.junit.jupiter.api.Assertions.assertEquals(expected, actual);
    }
}
