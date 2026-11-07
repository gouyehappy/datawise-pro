package org.apache.datawise.backend.server.pack;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.common.PackEntitlementException;
import org.apache.datawise.backend.config.EntitlementProperties;
import org.apache.datawise.backend.domain.pack.EntitlementSnapshotDto;
import org.apache.datawise.backend.domain.pack.LicenseDocument;
import org.apache.datawise.backend.domain.pack.PackAccessState;
import org.apache.datawise.backend.domain.pack.PackConnectorMap;
import org.apache.datawise.backend.domain.pack.PackEntitlementChecker;
import org.apache.datawise.backend.domain.pack.PackIds;
import org.apache.datawise.backend.domain.pack.PackRuntimeStatusDto;
import org.apache.datawise.backend.domain.pack.PackSuiteMap;
import org.apache.datawise.backend.domain.pack.PackTrialsDocument;
import org.apache.datawise.backend.domain.pack.PackTrialKeys;
import org.apache.datawise.backend.domain.pack.PackAuditActions;
import org.apache.datawise.backend.domain.pack.PackWatermark;
import org.apache.datawise.backend.domain.TenantIds;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

@Service
public class EntitlementService implements PackEntitlementChecker {

    private final EntitlementProperties properties;
    private final PackStateStore stateStore;
    private final ObjectMapper objectMapper;
    private final PackAuditService auditService;

    public EntitlementService(
            EntitlementProperties properties,
            PackStateStore stateStore,
            ObjectMapper objectMapper,
            PackAuditService auditService
    ) {
        this.properties = properties;
        this.stateStore = stateStore;
        this.objectMapper = objectMapper;
        this.auditService = auditService;
    }

    public EntitlementSnapshotDto currentSnapshot() {
        if (properties.isOpen()) {
            List<PackRuntimeStatusDto> packs = new ArrayList<>(PackIds.ALL.size());
            for (String packId : PackIds.ALL) {
                packs.add(PackRuntimeStatusDto.active(packId));
            }
            return new EntitlementSnapshotDto(
                    "open",
                    List.copyOf(packs),
                    null,
                    null,
                    properties.getFreeAiCallsDailyLimit(),
                    true,
                    null,
                    false,
                    properties.getSiteProTrialDays(),
                    properties.isHeartbeatConfigured(),
                    stateStore.readHeartbeatAt().orElse(null)
            );
        }

        Optional<LicenseDocument> license = activeLicense();
        Set<String> licensed = new HashSet<>();
        String suiteId = null;
        String siteId = null;
        if (license.isPresent()) {
            licensed.addAll(PackSuiteMap.expandLicensedPacks(license.get().packs(), license.get().suiteId()));
            suiteId = license.get().suiteId();
            siteId = license.get().siteId();
        }

        List<PackRuntimeStatusDto> packs = new ArrayList<>(PackIds.ALL.size());
        boolean aiUsable = false;
        boolean anyTrial = false;
        boolean anyLicensedActive = false;
        for (String packId : PackIds.ALL) {
            PackRuntimeStatusDto status = resolveEnforcedStatus(packId, licensed);
            packs.add(status);
            if (PackAccessState.TRIAL.equals(status.state())) {
                anyTrial = true;
            }
            if (PackAccessState.ACTIVE.equals(status.state())) {
                anyLicensedActive = true;
            }
            if (PackIds.isAiPack(packId) && isUsableState(status.state())) {
                aiUsable = true;
            }
        }
        Integer freeRemaining = null;
        if (!aiUsable) {
            int limit = Math.max(0, properties.getFreeAiCallsDailyLimit());
            int used = stateStore.readAiFreeUsage().calls();
            freeRemaining = Math.max(0, limit - used);
        }
        String watermark = PackWatermark.resolveFooter(
                properties.isWatermarkEnabled(),
                properties.getWatermarkText(),
                siteId,
                anyTrial || isSiteProTrialLicense(license.orElse(null)),
                anyLicensedActive && !anyTrial && !isSiteProTrialLicense(license.orElse(null))
        );
        return new EntitlementSnapshotDto(
                "enforced",
                List.copyOf(packs),
                suiteId,
                freeRemaining,
                properties.getFreeAiCallsDailyLimit(),
                PackSuiteMap.grantsMetaDoc(suiteId, licensed),
                watermark,
                isSiteProTrialAvailable(suiteId),
                properties.getSiteProTrialDays(),
                properties.isHeartbeatConfigured(),
                stateStore.readHeartbeatAt().orElse(null)
        );
    }

    @Override
    public boolean isPackUsable(String packId) {
        if (packId == null || packId.isBlank()) {
            return false;
        }
        if (properties.isOpen()) {
            return true;
        }
        Set<String> licensed = licensedPackIds();
        return isUsableState(resolveEnforcedStatus(packId, licensed).state());
    }

    @Override
    public void requirePack(String packId) {
        if (isPackUsable(packId)) {
            return;
        }
        auditService.packDenied(packId, "LICENSE_REQUIRED");
        throw PackEntitlementException.licenseRequired(packId);
    }

    @Override
    public boolean isMetaDocUsable() {
        if (properties.isOpen()) {
            return true;
        }
        Optional<LicenseDocument> license = activeLicense();
        String suiteId = license.map(LicenseDocument::suiteId).orElse(null);
        return PackSuiteMap.grantsMetaDoc(suiteId, licensedPackIds());
    }

    @Override
    public void requireMetaDoc() {
        if (isMetaDocUsable()) {
            return;
        }
        auditService.packDenied(PackSuiteMap.SUITE_ENTERPRISE, "METADOC");
        throw PackEntitlementException.licenseRequired(PackSuiteMap.SUITE_ENTERPRISE);
    }

    public void requireConnector(String connectorId) {
        Optional<String> packId = PackConnectorMap.packIdForConnector(connectorId);
        if (packId.isEmpty()) {
            return;
        }
        requirePack(packId.get());
    }

    public EntitlementSnapshotDto activateLicense(String licenseKey) {
        try {
            LicenseDocument document = LicenseCodec.verify(licenseKey, properties.getSigningSecret(), objectMapper);
            List<String> packs = LicenseCodec.normalizePackIds(document.packs());
            if (PackSuiteMap.isKnownSuite(document.suiteId())) {
                LinkedHashSet<String> expanded = new LinkedHashSet<>(packs);
                expanded.addAll(PackSuiteMap.packsForSuite(document.suiteId()));
                packs = List.copyOf(expanded);
            }
            if (packs.isEmpty()) {
                throw PackEntitlementException.licenseMismatch("No valid packs in license");
            }
            LicenseDocument normalized = new LicenseDocument(
                    document.version() > 0 ? document.version() : 1,
                    document.siteId(),
                    packs,
                    document.issuedAt() != null ? document.issuedAt() : Instant.now().toString(),
                    document.expiresAt(),
                    document.suiteId()
            );
            try {
                stateStore.writeLicense(normalized);
                for (String packId : packs) {
                    stateStore.markInstalled(packId, "licensed");
                }
            } catch (IOException ex) {
                throw new IllegalStateException("Failed to persist license: " + ex.getMessage(), ex);
            }
            auditService.licenseActivated(normalized.suiteId(), packs);
            return currentSnapshot();
        } catch (PackEntitlementException ex) {
            auditService.licenseRejected(ex.getMessage());
            throw ex;
        }
    }

    public EntitlementSnapshotDto startTrial(String packId) {
        String id = normalizePackId(packId);
        if (id == null) {
            throw PackEntitlementException.trialUnavailable("Unknown pack id");
        }
        PackTrialsDocument.TrialEntry existing = stateStore.trialMap().get(id);
        if (existing != null) {
            if (isFuture(existing.expiresAt())) {
                // already in trial — idempotent
                return currentSnapshot();
            }
            throw PackEntitlementException.trialUnavailable("Trial already used for pack: " + id);
        }
        if (isPackUsable(id) && !properties.isOpen()) {
            return currentSnapshot();
        }
        Instant start = Instant.now();
        Instant end = start.plus(Math.max(1, properties.getTrialDays()), ChronoUnit.DAYS);
        try {
            stateStore.putTrial(id, new PackTrialsDocument.TrialEntry(start.toString(), end.toString()));
            stateStore.markInstalled(id, "trial");
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to persist trial: " + ex.getMessage(), ex);
        }
        auditService.trialStarted(id);
        return currentSnapshot();
    }

    /**
     * §1.3 — one-shot site Pro suite trial (AI + Governance + Dev productivity via suite.pro).
     * Local default length is {@code site-pro-trial-days} (7); cloud may configure 14.
     */
    public EntitlementSnapshotDto claimSiteProTrial() {
        if (properties.isOpen()) {
            return currentSnapshot();
        }
        if (stateStore.trialMap().containsKey(PackTrialKeys.SITE_PRO)) {
            throw PackEntitlementException.trialUnavailable("Site Pro trial already claimed");
        }
        Optional<LicenseDocument> existing = activeLicense();
        if (existing.isPresent() && isCommercialSuite(existing.get().suiteId())) {
            try {
                Instant now = Instant.now();
                stateStore.putTrial(
                        PackTrialKeys.SITE_PRO,
                        new PackTrialsDocument.TrialEntry(now.toString(), now.toString())
                );
            } catch (IOException ex) {
                throw new IllegalStateException("Failed to mark site Pro trial claimed: " + ex.getMessage(), ex);
            }
            return currentSnapshot();
        }
        Instant start = Instant.now();
        int days = Math.max(1, properties.getSiteProTrialDays());
        Instant end = start.plus(days, ChronoUnit.DAYS);
        LicenseDocument document = new LicenseDocument(
                1,
                "site-pro-trial",
                List.of(),
                start.toString(),
                end.toString(),
                PackSuiteMap.SUITE_PRO
        );
        try {
            stateStore.writeLicense(document);
            stateStore.putTrial(
                    PackTrialKeys.SITE_PRO,
                    new PackTrialsDocument.TrialEntry(start.toString(), end.toString())
            );
            for (String packId : PackSuiteMap.packsForSuite(PackSuiteMap.SUITE_PRO)) {
                stateStore.markInstalled(packId, "site-pro-trial");
            }
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to persist site Pro trial: " + ex.getMessage(), ex);
        }
        auditService.record(PackAuditActions.SITE_PRO_TRIAL_STARTED, PackSuiteMap.SUITE_PRO, days + "d");
        return currentSnapshot();
    }

    /**
     * §1.3 cloud — auto-grant Pro suite trial for a newly created tenant (idempotent).
     * Writes into that tenant's pack state so other tenants stay isolated.
     */
    public void autoClaimTenantProTrialIfEnabled(String tenantId) {
        if (properties.isOpen() || !properties.isAutoClaimTenantProTrial()) {
            return;
        }
        String id = tenantId != null ? tenantId.trim() : "";
        if (id.isBlank() || TenantIds.DEFAULT.equals(id)) {
            return;
        }
        if (stateStore.trialMap(id).containsKey(PackTrialKeys.SITE_PRO)) {
            return;
        }
        Optional<LicenseDocument> existing = activeLicenseForTenant(id);
        if (existing.isPresent() && isCommercialSuite(existing.get().suiteId())) {
            try {
                Instant now = Instant.now();
                stateStore.putTrial(
                        id,
                        PackTrialKeys.SITE_PRO,
                        new PackTrialsDocument.TrialEntry(now.toString(), now.toString())
                );
            } catch (IOException ex) {
                throw new IllegalStateException("Failed to mark tenant Pro trial claimed: " + ex.getMessage(), ex);
            }
            return;
        }
        Instant start = Instant.now();
        int days = Math.max(1, properties.getTenantProTrialDays());
        Instant end = start.plus(days, ChronoUnit.DAYS);
        LicenseDocument document = new LicenseDocument(
                1,
                "tenant-pro-trial",
                List.of(),
                start.toString(),
                end.toString(),
                PackSuiteMap.SUITE_PRO
        );
        try {
            stateStore.writeLicense(id, document);
            stateStore.putTrial(
                    id,
                    PackTrialKeys.SITE_PRO,
                    new PackTrialsDocument.TrialEntry(start.toString(), end.toString())
            );
            for (String packId : PackSuiteMap.packsForSuite(PackSuiteMap.SUITE_PRO)) {
                stateStore.markInstalled(id, packId, "tenant-pro-trial");
            }
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to persist tenant Pro trial: " + ex.getMessage(), ex);
        }
        auditService.record(PackAuditActions.TENANT_PRO_TRIAL_STARTED, PackSuiteMap.SUITE_PRO, id + ":" + days + "d");
    }

    public EntitlementSnapshotDto installPack(String packId, String version) {
        String id = normalizePackId(packId);
        if (id == null) {
            throw new IllegalArgumentException("Unknown pack id");
        }
        if (!properties.isOpen()) {
            // must be entitled first
            Optional<LicenseDocument> license = activeLicense();
            boolean licensed = license.isPresent()
                    && PackSuiteMap.expandLicensedPacks(license.get().packs(), license.get().suiteId()).contains(id);
            PackTrialsDocument.TrialEntry trial = stateStore.trialMap().get(id);
            boolean inTrial = trial != null && isFuture(trial.expiresAt());
            if (!licensed && !inTrial) {
                throw PackEntitlementException.licenseRequired(id);
            }
        }
        try {
            stateStore.markInstalled(id, version);
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to mark pack installed: " + ex.getMessage(), ex);
        }
        auditService.record(PackAuditActions.PACK_INSTALLED, id, version);
        return currentSnapshot();
    }

    public EntitlementSnapshotDto uninstallPack(String packId) {
        String id = normalizePackId(packId);
        if (id == null) {
            throw new IllegalArgumentException("Unknown pack id");
        }
        try {
            stateStore.unmarkInstalled(id);
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to uninstall pack: " + ex.getMessage(), ex);
        }
        auditService.record(PackAuditActions.PACK_UNINSTALLED, id, null);
        return currentSnapshot();
    }

    /** Dev/test helper: issue a signed license key for the given packs. */
    public String issueDevLicense(List<String> packIds, String expiresAt, String suiteId) {
        if (properties.isUsingDevSigningSecret() && !properties.isOpen()) {
            throw new IllegalStateException(
                    "Refusing to issue licenses with the public default signing secret while entitlement.mode=enforced. "
                            + "Set datawise.entitlement.signing-secret to a unique value."
            );
        }
        LicenseDocument document = new LicenseDocument(
                1,
                "dev-site",
                LicenseCodec.normalizePackIds(packIds),
                Instant.now().toString(),
                expiresAt,
                suiteId
        );
        return LicenseCodec.issue(document, properties.getSigningSecret(), objectMapper);
    }

    private PackRuntimeStatusDto resolveEnforcedStatus(String packId, Set<String> licensed) {
        boolean installed = stateStore.isInstalled(packId);
        PackTrialsDocument.TrialEntry trial = stateStore.trialMap().get(packId);
        if (trial != null && isFuture(trial.expiresAt())) {
            int daysLeft = daysLeft(trial.expiresAt());
            if (!installed) {
                return new PackRuntimeStatusDto(packId, PackAccessState.NOT_INSTALLED, daysLeft, trial.expiresAt());
            }
            return new PackRuntimeStatusDto(packId, PackAccessState.TRIAL, daysLeft, trial.expiresAt());
        }
        if (licensed.contains(packId)) {
            Optional<LicenseDocument> license = activeLicense();
            String expiresAt = license.map(LicenseDocument::expiresAt).orElse(null);
            if (!installed) {
                return new PackRuntimeStatusDto(packId, PackAccessState.NOT_INSTALLED, null, expiresAt);
            }
            return new PackRuntimeStatusDto(packId, PackAccessState.ACTIVE, null, expiresAt);
        }
        if (trial != null && !isFuture(trial.expiresAt())) {
            return new PackRuntimeStatusDto(packId, PackAccessState.EXPIRED, 0, trial.expiresAt());
        }
        return PackRuntimeStatusDto.locked(packId);
    }

    private boolean isSiteProTrialAvailable(String suiteId) {
        if (stateStore.trialMap().containsKey(PackTrialKeys.SITE_PRO)) {
            return false;
        }
        return !isCommercialSuite(suiteId);
    }

    private static boolean isCommercialSuite(String suiteId) {
        return PackSuiteMap.SUITE_PRO.equals(suiteId)
                || PackSuiteMap.SUITE_ENTERPRISE.equals(suiteId)
                || PackSuiteMap.SUITE_PLATFORM.equals(suiteId);
    }

    private static boolean isSiteProTrialLicense(LicenseDocument document) {
        if (document == null || document.siteId() == null) {
            return false;
        }
        String siteId = document.siteId();
        return "site-pro-trial".equals(siteId) || "tenant-pro-trial".equals(siteId);
    }

    private Optional<LicenseDocument> activeLicenseForTenant(String tenantId) {
        Optional<LicenseDocument> license = stateStore.readLicense(tenantId);
        if (license.isEmpty()) {
            return Optional.empty();
        }
        LicenseDocument document = license.get();
        if (document.expiresAt() != null && !document.expiresAt().isBlank() && !isFuture(document.expiresAt())) {
            return Optional.empty();
        }
        return Optional.of(document);
    }

    private Set<String> licensedPackIds() {
        Optional<LicenseDocument> license = activeLicense();
        if (license.isEmpty()) {
            return Set.of();
        }
        LicenseDocument document = license.get();
        return new HashSet<>(PackSuiteMap.expandLicensedPacks(document.packs(), document.suiteId()));
    }

    private static boolean isUsableState(String state) {
        return PackAccessState.ACTIVE.equals(state) || PackAccessState.TRIAL.equals(state);
    }

    private Optional<LicenseDocument> activeLicense() {
        Optional<LicenseDocument> license = stateStore.readLicense();
        if (license.isEmpty()) {
            return Optional.empty();
        }
        LicenseDocument document = license.get();
        if (document.expiresAt() != null && !document.expiresAt().isBlank() && !isFuture(document.expiresAt())) {
            return Optional.empty();
        }
        return Optional.of(document);
    }

    private static String normalizePackId(String packId) {
        if (packId == null || packId.isBlank()) {
            return null;
        }
        String id = packId.trim();
        return PackIds.ALL.contains(id) ? id : null;
    }

    private static boolean isFuture(String isoInstant) {
        if (isoInstant == null || isoInstant.isBlank()) {
            return false;
        }
        try {
            return Instant.parse(isoInstant).isAfter(Instant.now());
        } catch (Exception ex) {
            return false;
        }
    }

    private static int daysLeft(String isoInstant) {
        try {
            long hours = ChronoUnit.HOURS.between(Instant.now(), Instant.parse(isoInstant));
            return (int) Math.max(0, (hours + 23) / 24);
        } catch (Exception ex) {
            return 0;
        }
    }
}
