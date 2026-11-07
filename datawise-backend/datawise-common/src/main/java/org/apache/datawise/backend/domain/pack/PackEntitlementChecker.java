package org.apache.datawise.backend.domain.pack;

/**
 * Runtime pack / MetaDoc gates used by controllers across modules.
 * Open mode implementations always allow.
 */
public interface PackEntitlementChecker {

    boolean isPackUsable(String packId);

    void requirePack(String packId);

    /** MetaDoc is an Enterprise suite feature (not a standalone SKU). */
    boolean isMetaDocUsable();

    void requireMetaDoc();
}
