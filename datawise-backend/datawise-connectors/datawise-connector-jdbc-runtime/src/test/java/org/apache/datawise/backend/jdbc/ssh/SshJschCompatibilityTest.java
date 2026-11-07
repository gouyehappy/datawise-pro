package org.apache.datawise.backend.jdbc.ssh;

import com.jcraft.jsch.JSch;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

class SshJschCompatibilityTest {

    @Test
    void applyGlobalDefaults_appendsLegacySshRsaHostKey() {
        SshJschCompatibility.applyGlobalDefaults();
        String hostKeys = JSch.getConfig("server_host_key");
        assertTrue(hostKeys.toLowerCase().contains("ssh-rsa"), hostKeys);
    }
}
