package org.apache.datawise.backend.domain.pack;

import java.util.List;

public record EntitlementSnapshotDto(
        String mode,
        List<PackRuntimeStatusDto> packs,
        String suiteId,
        Integer freeAiCallsRemaining,
        Integer freeAiCallsDailyLimit,
        Boolean metaDocUsable,
        String watermarkFooter,
        Boolean siteProTrialAvailable,
        Integer siteProTrialDays,
        Boolean heartbeatConfigured,
        String heartbeatAt) {

    public EntitlementSnapshotDto(
                                  String mode,
                                  List<PackRuntimeStatusDto> packs,
                                  String suiteId,
                                  Integer freeAiCallsRemaining,
                                  Integer freeAiCallsDailyLimit) {
        this(mode, packs, suiteId, freeAiCallsRemaining, freeAiCallsDailyLimit, null, null, null, null, null, null);
    }

    public EntitlementSnapshotDto(
                                  String mode,
                                  List<PackRuntimeStatusDto> packs,
                                  String suiteId,
                                  Integer freeAiCallsRemaining,
                                  Integer freeAiCallsDailyLimit,
                                  Boolean metaDocUsable) {
        this(mode, packs, suiteId, freeAiCallsRemaining, freeAiCallsDailyLimit, metaDocUsable, null, null, null, null, null);
    }

    public EntitlementSnapshotDto(
                                  String mode,
                                  List<PackRuntimeStatusDto> packs,
                                  String suiteId,
                                  Integer freeAiCallsRemaining,
                                  Integer freeAiCallsDailyLimit,
                                  Boolean metaDocUsable,
                                  String watermarkFooter) {
        this(mode, packs, suiteId, freeAiCallsRemaining, freeAiCallsDailyLimit, metaDocUsable, watermarkFooter, null, null, null, null);
    }

    public EntitlementSnapshotDto(
                                  String mode,
                                  List<PackRuntimeStatusDto> packs,
                                  String suiteId,
                                  Integer freeAiCallsRemaining,
                                  Integer freeAiCallsDailyLimit,
                                  Boolean metaDocUsable,
                                  String watermarkFooter,
                                  Boolean siteProTrialAvailable,
                                  Integer siteProTrialDays) {
        this(
                mode,
                packs,
                suiteId,
                freeAiCallsRemaining,
                freeAiCallsDailyLimit,
                metaDocUsable,
                watermarkFooter,
                siteProTrialAvailable,
                siteProTrialDays,
                null,
                null);
    }
}
