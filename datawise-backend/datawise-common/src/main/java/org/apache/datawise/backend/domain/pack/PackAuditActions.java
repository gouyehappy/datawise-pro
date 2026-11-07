package org.apache.datawise.backend.domain.pack;

/**
 * Pack entitlement audit action names (activate / reject / tamper / trial / deny / heartbeat).
 */
public final class PackAuditActions {

    public static final String LICENSE_ACTIVATED = "LICENSE_ACTIVATED";
    public static final String LICENSE_REJECTED = "LICENSE_REJECTED";
    public static final String LICENSE_TAMPERED = "LICENSE_TAMPERED";
    public static final String TRIAL_STARTED = "TRIAL_STARTED";
    public static final String SITE_PRO_TRIAL_STARTED = "SITE_PRO_TRIAL_STARTED";
    public static final String TENANT_PRO_TRIAL_STARTED = "TENANT_PRO_TRIAL_STARTED";
    public static final String PACK_DENIED = "PACK_DENIED";
    public static final String PACK_INSTALLED = "PACK_INSTALLED";
    public static final String PACK_UNINSTALLED = "PACK_UNINSTALLED";
    public static final String HEARTBEAT_OK = "HEARTBEAT_OK";
    public static final String HEARTBEAT_FAIL = "HEARTBEAT_FAIL";

    private PackAuditActions() {
    }
}
