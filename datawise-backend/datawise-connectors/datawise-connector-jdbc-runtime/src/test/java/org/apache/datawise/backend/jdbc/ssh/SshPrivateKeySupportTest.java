package org.apache.datawise.backend.jdbc.ssh;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SshPrivateKeySupportTest {

    @Test
    void looksLikePemPrivateKey_acceptsOpenSshPem() {
        assertTrue(SshPrivateKeySupport.looksLikePemPrivateKey(
                "-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----"
        ));
    }

    @Test
    void looksLikePemPrivateKey_rejectsArbitraryText() {
        assertFalse(SshPrivateKeySupport.looksLikePemPrivateKey("placeholder"));
        assertFalse(SshPrivateKeySupport.looksLikePemPrivateKey(""));
        assertFalse(SshPrivateKeySupport.looksLikePemPrivateKey(null));
    }
}
