package org.apache.datawise.backend.jdbc.ssh;

/**
 * Guards against treating arbitrary textarea content as an SSH private key.
 * Invalid key material causes JSch to burn JumpServer auth attempts on publickey
 * before password is tried.
 */
public final class SshPrivateKeySupport {

    private SshPrivateKeySupport() {
    }

    public static boolean looksLikePemPrivateKey(String value) {
        if (value == null || value.isBlank()) {
            return false;
        }
        String trimmed = value.trim();
        return trimmed.contains("BEGIN") && trimmed.contains("PRIVATE KEY");
    }
}
