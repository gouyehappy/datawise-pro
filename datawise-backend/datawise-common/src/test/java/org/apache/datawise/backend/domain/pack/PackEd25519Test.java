package org.apache.datawise.backend.domain.pack;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.security.KeyPair;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PackEd25519Test {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void ed25519SignedPackVerifies(@TempDir Path temp) throws Exception {
        KeyPair pair = PackEd25519.generate();
        Path priv = temp.resolve("pack.priv.pem");
        Path pub = temp.resolve("pack.pub.pem");
        PackEd25519.writeKeyPair(priv, pub, pair);

        byte[] dpk = PackDpkCodec.build(
                PackManifest.of(PackIds.AI, "1.0.0"),
                Map.of(),
                "hmac-secret",
                mapper,
                false,
                null,
                PackEd25519.loadPrivateKey(priv));
        PackDpkCodec.VerifiedPack ok = PackDpkCodec.verify(
                dpk,
                "wrong-hmac-ignored",
                false,
                mapper,
                PackEd25519.loadPublicKey(pub),
                true);
        assertEquals(PackIds.AI, ok.manifest().packId());
        assertTrue(ok.payloadEntries().containsKey(PackDpkCodec.MANIFEST_ENTRY));
    }

    @Test
    void tamperedEd25519Rejected(@TempDir Path temp) throws Exception {
        KeyPair pair = PackEd25519.generate();
        byte[] dpk = PackDpkCodec.build(
                PackManifest.of(PackIds.BACKUP, "1.0.0"),
                Map.of(),
                "hmac-secret",
                mapper,
                false,
                null,
                pair.getPrivate());
        dpk[dpk.length / 3] ^= 0x22;
        assertThrows(
                Exception.class,
                () -> PackDpkCodec.verify(dpk, "hmac-secret", false, mapper, pair.getPublic(), true));
    }
}
