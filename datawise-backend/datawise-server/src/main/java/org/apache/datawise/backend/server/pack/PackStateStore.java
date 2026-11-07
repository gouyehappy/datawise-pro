package org.apache.datawise.backend.server.pack;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.common.PackEntitlementException;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.ConfigPaths;
import org.apache.datawise.backend.configstore.TenantScopedConfigSupport;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.domain.pack.AiFreeUsageDocument;
import org.apache.datawise.backend.domain.pack.LicenseDocument;
import org.apache.datawise.backend.domain.pack.PackAuditDocument;
import org.apache.datawise.backend.domain.pack.PackInstalledDocument;
import org.apache.datawise.backend.domain.pack.PackTrialsDocument;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Component
public class PackStateStore {

    private final ConfigDirectoryService configDirectory;
    private final ObjectMapper objectMapper;

    public PackStateStore(ConfigDirectoryService configDirectory, ObjectMapper objectMapper) {
        this.configDirectory = configDirectory;
        this.objectMapper = objectMapper;
    }

    public Optional<LicenseDocument> readLicense() {
        return readLicense(currentTenantId());
    }

    public Optional<LicenseDocument> readLicense(String tenantId) {
        Path path = licensePathForRead(tenantId);
        if (!Files.isRegularFile(path)) {
            return Optional.empty();
        }
        try {
            return Optional.ofNullable(objectMapper.readValue(path.toFile(), LicenseDocument.class));
        } catch (IOException ex) {
            throw PackEntitlementException.licenseCorrupt(
                    "License file is corrupt or unreadable: " + path.getFileName()
            );
        }
    }

    public synchronized void writeLicense(LicenseDocument document) throws IOException {
        writeLicense(currentTenantId(), document);
    }

    public synchronized void writeLicense(String tenantId, LicenseDocument document) throws IOException {
        ensureTenantPacksDir(tenantId);
        Path path = licensePathForWrite(tenantId);
        objectMapper.writerWithDefaultPrettyPrinter().writeValue(path.toFile(), document);
    }

    public PackTrialsDocument readTrials() {
        return readTrials(currentTenantId());
    }

    public PackTrialsDocument readTrials(String tenantId) {
        Path path = trialsPathForRead(tenantId);
        if (!Files.isRegularFile(path)) {
            return PackTrialsDocument.empty();
        }
        try {
            PackTrialsDocument doc = objectMapper.readValue(path.toFile(), PackTrialsDocument.class);
            return doc != null && doc.trials() != null ? doc : PackTrialsDocument.empty();
        } catch (IOException ex) {
            return PackTrialsDocument.empty();
        }
    }

    public synchronized void writeTrials(PackTrialsDocument document) throws IOException {
        writeTrials(currentTenantId(), document);
    }

    public synchronized void writeTrials(String tenantId, PackTrialsDocument document) throws IOException {
        ensureTenantPacksDir(tenantId);
        Path path = trialsPathForWrite(tenantId);
        objectMapper.writerWithDefaultPrettyPrinter().writeValue(
                path.toFile(),
                document != null ? document : PackTrialsDocument.empty()
        );
    }

    public PackInstalledDocument readInstalled() {
        return readInstalled(currentTenantId());
    }

    public PackInstalledDocument readInstalled(String tenantId) {
        Path path = installedPathForRead(tenantId);
        if (!Files.isRegularFile(path)) {
            return PackInstalledDocument.empty();
        }
        try {
            PackInstalledDocument doc = objectMapper.readValue(path.toFile(), PackInstalledDocument.class);
            return doc != null && doc.packs() != null ? doc : PackInstalledDocument.empty();
        } catch (IOException ex) {
            return PackInstalledDocument.empty();
        }
    }

    public synchronized void markInstalled(String packId, String version) throws IOException {
        markInstalled(currentTenantId(), packId, version);
    }

    public synchronized void markInstalled(String tenantId, String packId, String version) throws IOException {
        if (packId == null || packId.isBlank()) {
            return;
        }
        PackInstalledDocument current = readInstalled(tenantId);
        List<PackInstalledDocument.InstalledEntry> next = new ArrayList<>();
        boolean replaced = false;
        String now = Instant.now().toString();
        String ver = version != null && !version.isBlank() ? version.trim() : "1.0.0";
        for (PackInstalledDocument.InstalledEntry entry : current.packs()) {
            if (entry != null && packId.equals(entry.packId())) {
                next.add(new PackInstalledDocument.InstalledEntry(packId, ver, now));
                replaced = true;
            } else if (entry != null) {
                next.add(entry);
            }
        }
        if (!replaced) {
            next.add(new PackInstalledDocument.InstalledEntry(packId, ver, now));
        }
        ensureTenantPacksDir(tenantId);
        Path path = installedPathForWrite(tenantId);
        objectMapper.writerWithDefaultPrettyPrinter().writeValue(
                path.toFile(),
                new PackInstalledDocument(List.copyOf(next))
        );
    }

    public synchronized void unmarkInstalled(String packId) throws IOException {
        unmarkInstalled(currentTenantId(), packId);
    }

    public synchronized void unmarkInstalled(String tenantId, String packId) throws IOException {
        if (packId == null || packId.isBlank()) {
            return;
        }
        PackInstalledDocument current = readInstalled(tenantId);
        List<PackInstalledDocument.InstalledEntry> next = current.packs().stream()
                .filter(entry -> entry != null && !packId.equals(entry.packId()))
                .toList();
        ensureTenantPacksDir(tenantId);
        Path path = installedPathForWrite(tenantId);
        objectMapper.writerWithDefaultPrettyPrinter().writeValue(
                path.toFile(),
                new PackInstalledDocument(next)
        );
    }

    public boolean isInstalled(String packId) {
        return isInstalled(currentTenantId(), packId);
    }

    public boolean isInstalled(String tenantId, String packId) {
        return readInstalled(tenantId).packs().stream()
                .anyMatch(entry -> entry != null && packId != null && packId.equals(entry.packId()));
    }

    public Map<String, PackTrialsDocument.TrialEntry> trialMap() {
        return trialMap(currentTenantId());
    }

    public Map<String, PackTrialsDocument.TrialEntry> trialMap(String tenantId) {
        PackTrialsDocument doc = readTrials(tenantId);
        return doc.trials() != null ? doc.trials() : Map.of();
    }

    public synchronized void putTrial(String packId, PackTrialsDocument.TrialEntry entry) throws IOException {
        putTrial(currentTenantId(), packId, entry);
    }

    public synchronized void putTrial(String tenantId, String packId, PackTrialsDocument.TrialEntry entry)
            throws IOException {
        Map<String, PackTrialsDocument.TrialEntry> map = new LinkedHashMap<>(trialMap(tenantId));
        map.put(packId, entry);
        writeTrials(tenantId, new PackTrialsDocument(Map.copyOf(map)));
    }

    public AiFreeUsageDocument readAiFreeUsage() {
        String today = LocalDate.now(ZoneId.systemDefault()).toString();
        Path path = configDirectory.resolve(ConfigPaths.PACK_AI_FREE_USAGE);
        if (!Files.isRegularFile(path)) {
            return AiFreeUsageDocument.empty(today);
        }
        try {
            AiFreeUsageDocument doc = objectMapper.readValue(path.toFile(), AiFreeUsageDocument.class);
            if (doc == null || doc.day() == null || !today.equals(doc.day())) {
                return AiFreeUsageDocument.empty(today);
            }
            return new AiFreeUsageDocument(today, Math.max(0, doc.calls()));
        } catch (IOException ex) {
            return AiFreeUsageDocument.empty(today);
        }
    }

    public synchronized AiFreeUsageDocument consumeAiFreeCall(int dailyLimit) throws IOException {
        String today = LocalDate.now(ZoneId.systemDefault()).toString();
        AiFreeUsageDocument current = readAiFreeUsage();
        if (!today.equals(current.day())) {
            current = AiFreeUsageDocument.empty(today);
        }
        if (dailyLimit > 0 && current.calls() >= dailyLimit) {
            return current;
        }
        AiFreeUsageDocument next = new AiFreeUsageDocument(today, current.calls() + 1);
        ensureSitePacksDir();
        Path path = configDirectory.resolve(ConfigPaths.PACK_AI_FREE_USAGE);
        objectMapper.writerWithDefaultPrettyPrinter().writeValue(path.toFile(), next);
        return next;
    }

    public PackAuditDocument readAudit() {
        Path path = configDirectory.resolve(ConfigPaths.PACK_AUDIT);
        if (!Files.isRegularFile(path)) {
            return PackAuditDocument.empty();
        }
        try {
            PackAuditDocument doc = objectMapper.readValue(path.toFile(), PackAuditDocument.class);
            return doc != null && doc.events() != null ? doc : PackAuditDocument.empty();
        } catch (IOException ex) {
            return PackAuditDocument.empty();
        }
    }

    public synchronized void appendAudit(PackAuditDocument.PackAuditEvent event, int maxEvents) throws IOException {
        if (event == null) {
            return;
        }
        List<PackAuditDocument.PackAuditEvent> next = new ArrayList<>();
        next.add(event);
        for (PackAuditDocument.PackAuditEvent existing : readAudit().events()) {
            if (existing != null) {
                next.add(existing);
            }
            if (next.size() >= Math.max(50, maxEvents)) {
                break;
            }
        }
        ensureSitePacksDir();
        Path path = configDirectory.resolve(ConfigPaths.PACK_AUDIT);
        objectMapper.writerWithDefaultPrettyPrinter().writeValue(
                path.toFile(),
                new PackAuditDocument(List.copyOf(next))
        );
    }

    public Optional<String> readHeartbeatAt() {
        Path path = configDirectory.resolve(ConfigPaths.PACK_HEARTBEAT);
        if (!Files.isRegularFile(path)) {
            return Optional.empty();
        }
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> map = objectMapper.readValue(path.toFile(), Map.class);
            Object at = map != null ? map.get("lastAt") : null;
            return at != null ? Optional.of(String.valueOf(at)) : Optional.empty();
        } catch (IOException ex) {
            return Optional.empty();
        }
    }

    public synchronized void writeHeartbeatAt(String isoInstant) throws IOException {
        ensureSitePacksDir();
        Path path = configDirectory.resolve(ConfigPaths.PACK_HEARTBEAT);
        Map<String, String> body = Map.of("lastAt", isoInstant != null ? isoInstant : Instant.now().toString());
        objectMapper.writerWithDefaultPrettyPrinter().writeValue(path.toFile(), body);
    }

    private static String currentTenantId() {
        return TenantScopedConfigSupport.currentTenantId();
    }

    private Path licensePathForRead(String tenantId) {
        String id = TenantIds.normalizeOrDefault(tenantId);
        Path tenantPath = configDirectory.resolve(ConfigPaths.tenantPackLicense(id));
        if (Files.isRegularFile(tenantPath)) {
            return tenantPath;
        }
        if (TenantIds.DEFAULT.equals(id)) {
            Path legacy = configDirectory.resolve(ConfigPaths.PACK_LICENSE);
            if (Files.isRegularFile(legacy)) {
                return legacy;
            }
        }
        return tenantPath;
    }

    private Path licensePathForWrite(String tenantId) {
        return configDirectory.resolve(ConfigPaths.tenantPackLicense(TenantIds.normalizeOrDefault(tenantId)));
    }

    private Path trialsPathForRead(String tenantId) {
        String id = TenantIds.normalizeOrDefault(tenantId);
        Path tenantPath = configDirectory.resolve(ConfigPaths.tenantPackTrials(id));
        if (Files.isRegularFile(tenantPath)) {
            return tenantPath;
        }
        if (TenantIds.DEFAULT.equals(id)) {
            Path legacy = configDirectory.resolve(ConfigPaths.PACK_TRIALS);
            if (Files.isRegularFile(legacy)) {
                return legacy;
            }
        }
        return tenantPath;
    }

    private Path trialsPathForWrite(String tenantId) {
        return configDirectory.resolve(ConfigPaths.tenantPackTrials(TenantIds.normalizeOrDefault(tenantId)));
    }

    private Path installedPathForRead(String tenantId) {
        String id = TenantIds.normalizeOrDefault(tenantId);
        Path tenantPath = configDirectory.resolve(ConfigPaths.tenantPackInstalled(id));
        if (Files.isRegularFile(tenantPath)) {
            return tenantPath;
        }
        if (TenantIds.DEFAULT.equals(id)) {
            Path legacy = configDirectory.resolve(ConfigPaths.PACK_INSTALLED);
            if (Files.isRegularFile(legacy)) {
                return legacy;
            }
        }
        return tenantPath;
    }

    private Path installedPathForWrite(String tenantId) {
        return configDirectory.resolve(ConfigPaths.tenantPackInstalled(TenantIds.normalizeOrDefault(tenantId)));
    }

    private void ensureTenantPacksDir(String tenantId) throws IOException {
        Files.createDirectories(configDirectory.resolve(ConfigPaths.tenantPacksDir(TenantIds.normalizeOrDefault(tenantId))));
    }

    private void ensureSitePacksDir() throws IOException {
        Files.createDirectories(configDirectory.resolve(ConfigPaths.PACKS_DIR));
    }
}
