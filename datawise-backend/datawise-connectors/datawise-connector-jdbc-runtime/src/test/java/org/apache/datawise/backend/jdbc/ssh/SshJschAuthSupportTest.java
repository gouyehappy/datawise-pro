package org.apache.datawise.backend.jdbc.ssh;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class SshJschAuthSupportTest {

    @Test
    void preferredAuthentications_passwordOnlyIncludesKeyboardInteractive() {
        assertEquals(
                "password,keyboard-interactive",
                SshJschAuthSupport.preferredAuthentications(false, "secret")
        );
    }

    @Test
    void preferredAuthentications_keyOnlyUsesPublickey() {
        assertEquals(
                "publickey,keyboard-interactive",
                SshJschAuthSupport.preferredAuthentications(true, null)
        );
    }

    @Test
    void preferredAuthentications_keyAndPasswordPrefersKeyboardInteractive() {
        assertEquals(
                "keyboard-interactive,password,publickey",
                SshJschAuthSupport.preferredAuthentications(true, "secret")
        );
    }
}
