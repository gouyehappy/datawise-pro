package org.apache.datawise.backend.common;

import org.apache.datawise.backend.domain.pack.PackIds;

/**
 * Commercial pack / license gate. Maps to PRODUCT_EXTENSION_PACKS.md error codes.
 */
public class PackEntitlementException extends RuntimeException {

    private final String errorCode;
    private final int httpStatus;
    private final String packId;

    public PackEntitlementException(String errorCode, String message, int httpStatus) {
        this(errorCode, message, httpStatus, null);
    }

    public PackEntitlementException(String errorCode, String message, int httpStatus, String packId) {
        super(message);
        this.errorCode = errorCode != null ? errorCode : DatawiseErrorCodes.LICENSE_REQUIRED;
        this.httpStatus = httpStatus > 0 ? httpStatus : 402;
        this.packId = packId;
    }

    public String errorCode() {
        return errorCode;
    }

    public int httpStatus() {
        return httpStatus;
    }

    /** Pack that triggered the gate; may be null for generic license errors. */
    public String packId() {
        return packId;
    }

    public static PackEntitlementException licenseRequired(String packId) {
        return new PackEntitlementException(
                DatawiseErrorCodes.LICENSE_REQUIRED,
                "License required for pack: " + packId,
                402,
                packId);
    }

    public static PackEntitlementException licenseExpired() {
        return new PackEntitlementException(
                DatawiseErrorCodes.LICENSE_EXPIRED,
                "License expired",
                402);
    }

    public static PackEntitlementException licenseMismatch(String message) {
        return new PackEntitlementException(
                DatawiseErrorCodes.LICENSE_MISMATCH,
                message != null ? message : "License mismatch",
                403);
    }

    /** License file is present but unreadable / invalid JSON. */
    public static PackEntitlementException licenseCorrupt(String message) {
        return new PackEntitlementException(
                DatawiseErrorCodes.LICENSE_CORRUPT,
                message != null ? message : "License file is corrupt",
                500);
    }

    public static PackEntitlementException packNotInstalled(String packId) {
        return new PackEntitlementException(
                DatawiseErrorCodes.PACK_NOT_INSTALLED,
                "Pack not installed: " + packId,
                403,
                packId);
    }

    public static PackEntitlementException trialUnavailable(String message) {
        return new PackEntitlementException(
                DatawiseErrorCodes.LICENSE_REQUIRED,
                message != null ? message : "Trial unavailable",
                402);
    }

    public static PackEntitlementException quotaExceeded(String message) {
        return new PackEntitlementException(
                DatawiseErrorCodes.QUOTA_EXCEEDED,
                message != null ? message : "Quota exceeded",
                429,
                PackIds.AI);
    }

    /** Tenant connection count hard cap (not a pack SKU gate). */
    public static PackEntitlementException connectionQuotaExceeded(String message) {
        return new PackEntitlementException(
                DatawiseErrorCodes.CONNECTION_QUOTA_EXCEEDED,
                message != null ? message : "Organization connection quota exceeded",
                429);
    }
}
