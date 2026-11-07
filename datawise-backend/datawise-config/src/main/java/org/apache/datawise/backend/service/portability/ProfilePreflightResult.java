package org.apache.datawise.backend.service.portability;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class ProfilePreflightResult {

    private boolean passphraseOk;
    private boolean schemaCompatible;
    private ProfileManifest manifest;
    private List<String> warnings = new ArrayList<>();
    private List<ProfileConflictItem> conflicts = new ArrayList<>();
    private Map<String, Object> counts = new LinkedHashMap<>();
    private String legacyKind;

    public boolean isPassphraseOk() {
        return passphraseOk;
    }

    public void setPassphraseOk(boolean passphraseOk) {
        this.passphraseOk = passphraseOk;
    }

    public boolean isSchemaCompatible() {
        return schemaCompatible;
    }

    public void setSchemaCompatible(boolean schemaCompatible) {
        this.schemaCompatible = schemaCompatible;
    }

    public ProfileManifest getManifest() {
        return manifest;
    }

    public void setManifest(ProfileManifest manifest) {
        this.manifest = manifest;
    }

    public List<String> getWarnings() {
        return warnings;
    }

    public void setWarnings(List<String> warnings) {
        this.warnings = warnings != null ? warnings : new ArrayList<>();
    }

    public List<ProfileConflictItem> getConflicts() {
        return conflicts;
    }

    public void setConflicts(List<ProfileConflictItem> conflicts) {
        this.conflicts = conflicts != null ? conflicts : new ArrayList<>();
    }

    public Map<String, Object> getCounts() {
        return counts;
    }

    public void setCounts(Map<String, Object> counts) {
        this.counts = counts != null ? counts : new LinkedHashMap<>();
    }

    public String getLegacyKind() {
        return legacyKind;
    }

    public void setLegacyKind(String legacyKind) {
        this.legacyKind = legacyKind;
    }
}
