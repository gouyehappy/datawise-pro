package org.apache.datawise.backend.security;

/**
 * Explorer endpoints that need {@link org.apache.datawise.backend.service.FeaturePermissionAccess}
 * helpers (guest / API-token bypass rules) rather than a bare feature key.
 */
public enum ExplorerFeatureGate {
    CONNECTION,
    CATALOG_MUTATION,
    DANGEROUS,
    EXPORT,
    CONSOLE
}
