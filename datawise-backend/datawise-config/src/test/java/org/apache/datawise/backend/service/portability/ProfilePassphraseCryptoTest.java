package org.apache.datawise.backend.service.portability;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ProfilePassphraseCryptoTest {

    @Test
    void sealsAndUnsealsRoundTrip() {
        ProfilePassphraseCrypto.SealedSecrets sealed =
                ProfilePassphraseCrypto.seal("correct-horse", "{\"a\":\"secret\"}");
        assertTrue(sealed.sealedBin().length > 12);
        assertEquals(ProfilePassphraseCrypto.KDF_ALG, sealed.kdf().get("alg"));
        String json = ProfilePassphraseCrypto.unseal("correct-horse", sealed.sealedBin(), sealed.kdf());
        assertEquals("{\"a\":\"secret\"}", json);
    }

    @Test
    void rejectsWrongPassphrase() {
        ProfilePassphraseCrypto.SealedSecrets sealed =
                ProfilePassphraseCrypto.seal("correct-horse", "{\"a\":\"secret\"}");
        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> ProfilePassphraseCrypto.unseal("wrong-pass", sealed.sealedBin(), sealed.kdf()));
        assertEquals("PASSPHRASE_INCORRECT", ex.getMessage());
    }

    @Test
    void rejectsShortPassphrase() {
        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> ProfilePassphraseCrypto.seal("abc", "{}"));
        assertEquals("PASSPHRASE_TOO_SHORT", ex.getMessage());
    }

    @Test
    void acceptsMinLengthPassphrase() {
        ProfilePassphraseCrypto.SealedSecrets sealed =
                ProfilePassphraseCrypto.seal("1234", "{\"a\":1}");
        assertEquals("{\"a\":1}", ProfilePassphraseCrypto.unseal("1234", sealed.sealedBin(), sealed.kdf()));
    }
}
