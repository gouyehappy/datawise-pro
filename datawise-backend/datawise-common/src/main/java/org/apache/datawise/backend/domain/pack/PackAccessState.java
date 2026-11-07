package org.apache.datawise.backend.domain.pack;

/**
 * Runtime access state for an Extension Pack.
 */
public final class PackAccessState {

    public static final String ACTIVE = "active";
    public static final String TRIAL = "trial";
    public static final String LOCKED = "locked";
    public static final String EXPIRED = "expired";
    public static final String NOT_INSTALLED = "not_installed";

    private PackAccessState() {
    }
}
