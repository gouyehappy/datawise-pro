package org.apache.datawise.backend.domain;

/**
 * Integrity / provenance of a connector as shown in the marketplace.
 */
public final class ConnectorPluginIntegrityStatus {

    /** Built into the server classpath (not a drop-in JAR). */
    public static final String BUNDLED = "bundled";
    /** JAR present and SHA-256 matches the manifest. */
    public static final String VERIFIED = "verified";
    /** JAR present but SHA-256 does not match the manifest. */
    public static final String MISMATCH = "mismatch";
    /** JAR loaded but not listed (or listed without sha256) in the manifest. */
    public static final String UNSIGNED = "unsigned";
    /** Listed in the manifest but JAR is not available at runtime. */
    public static final String MISSING = "missing";
    /** No manifest entry and no drop-in JAR for this catalog type. */
    public static final String NONE = "none";

    private ConnectorPluginIntegrityStatus() {
    }
}
