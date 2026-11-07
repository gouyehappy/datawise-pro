package org.apache.datawise.backend.domain.pack;

import java.util.List;

/** Installed pack registry under {@code config/packs/installed.json}. */
public record PackInstalledDocument(List<InstalledEntry> packs) {

    public record InstalledEntry(String packId, String version, String installedAt) {
    }

    public static PackInstalledDocument empty() {
        return new PackInstalledDocument(List.of());
    }
}
