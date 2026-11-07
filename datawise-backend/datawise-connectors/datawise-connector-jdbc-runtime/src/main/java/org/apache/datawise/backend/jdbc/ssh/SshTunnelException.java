package org.apache.datawise.backend.jdbc.ssh;

public class SshTunnelException extends Exception {

    public static final String ERROR_CODE = "SSH_TUNNEL_FAILED";

    public SshTunnelException(String message) {
        super(message);
    }

    public SshTunnelException(String message, Throwable cause) {
        super(message, cause);
    }
}
