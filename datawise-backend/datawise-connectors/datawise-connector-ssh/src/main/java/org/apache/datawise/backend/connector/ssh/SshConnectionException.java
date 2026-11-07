package org.apache.datawise.backend.connector.ssh;

public class SshConnectionException extends Exception {

    public static final String ERROR_CODE = "SSH_CONNECTION_FAILED";

    public SshConnectionException(String message) {
        super(message);
    }

    public SshConnectionException(String message, Throwable cause) {
        super(message, cause);
    }
}
