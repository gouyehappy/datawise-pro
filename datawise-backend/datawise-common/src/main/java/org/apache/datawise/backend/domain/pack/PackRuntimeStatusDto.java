package org.apache.datawise.backend.domain.pack;

public record PackRuntimeStatusDto(
        String packId,
        String state,
        Integer trialDaysLeft,
        String expiresAt) {

    public static PackRuntimeStatusDto active(String packId) {
        return new PackRuntimeStatusDto(packId, PackAccessState.ACTIVE, null, null);
    }

    public static PackRuntimeStatusDto locked(String packId) {
        return new PackRuntimeStatusDto(packId, PackAccessState.LOCKED, null, null);
    }
}
