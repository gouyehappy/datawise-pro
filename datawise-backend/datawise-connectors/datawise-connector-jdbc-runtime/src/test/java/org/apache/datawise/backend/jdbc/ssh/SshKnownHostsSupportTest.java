package org.apache.datawise.backend.jdbc.ssh;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class SshKnownHostsSupportTest {

    @Test
    void strictHostKeyCheckingMode_mapsProperties() {
        SshTunnelProperties strictAcceptNew = new SshTunnelProperties();
        strictAcceptNew.setStrictHostKeyChecking(true);
        strictAcceptNew.setAcceptNewHostKeys(true);
        assertEquals("accept-new", SshKnownHostsSupport.strictHostKeyCheckingMode(strictAcceptNew));

        SshTunnelProperties strictOnly = new SshTunnelProperties();
        strictOnly.setStrictHostKeyChecking(true);
        strictOnly.setAcceptNewHostKeys(false);
        assertEquals("yes", SshKnownHostsSupport.strictHostKeyCheckingMode(strictOnly));

        SshTunnelProperties disabled = new SshTunnelProperties();
        disabled.setStrictHostKeyChecking(false);
        assertEquals("no", SshKnownHostsSupport.strictHostKeyCheckingMode(disabled));
    }
}
