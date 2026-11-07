package org.apache.datawise.backend.security;

/**
 * Where the AES master key was loaded from.
 */
public enum MasterKeySource {
    /** {@code DATAWISE_MASTER_KEY} environment variable */
    ENV,
    /** Existing master-key file ({@code config/secrets/.datawise-master-key} or legacy path / {@code DATAWISE_MASTER_KEY_FILE}) */
    FILE,
    /** Newly generated and persisted to the key file */
    GENERATED
}
