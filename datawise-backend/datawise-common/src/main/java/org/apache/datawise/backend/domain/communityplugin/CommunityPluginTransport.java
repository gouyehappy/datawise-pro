package org.apache.datawise.backend.domain.communityplugin;

/**
 * Sidecar stdio transport declared in {@code entrypoints.backend.transport}.
 */
public enum CommunityPluginTransport {

    STDIO_JSONL("stdio-jsonl"),
    STDIO_FRAMED("stdio-framed");

    private final String wire;

    CommunityPluginTransport(String wire) {
        this.wire = wire;
    }

    public String wire() {
        return wire;
    }

    public static CommunityPluginTransport fromWire(String value) {
        if (value == null || value.isBlank() || STDIO_JSONL.wire.equalsIgnoreCase(value.trim())) {
            return STDIO_JSONL;
        }
        if (STDIO_FRAMED.wire.equalsIgnoreCase(value.trim())) {
            return STDIO_FRAMED;
        }
        throw new CommunityPluginException("Unsupported backend transport: " + value);
    }

    public boolean isFramed() {
        return this == STDIO_FRAMED;
    }
}
