package org.apache.datawise.backend.service.ssh;

import org.apache.datawise.backend.configstore.UserSshScriptRecordStore;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.SshScriptRecord;
import org.apache.datawise.backend.service.ConnectionVisibilityService;
import org.apache.datawise.backend.service.UserAccountService;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Service
public class SshScriptRecordService {

    private final UserSshScriptRecordStore recordStore;
    private final ConnectionVisibilityService connectionVisibilityService;
    private final UserAccountService userAccountService;

    public SshScriptRecordService(
            UserSshScriptRecordStore recordStore,
            ConnectionVisibilityService connectionVisibilityService,
            UserAccountService userAccountService
    ) {
        this.recordStore = recordStore;
        this.connectionVisibilityService = connectionVisibilityService;
        this.userAccountService = userAccountService;
    }

    public record SaveCommand(String connectionId, SshScriptRecord entry) {
    }

    public List<SshScriptRecord> list(String connectionId) {
        long userId = userAccountService.requireUserId();
        requireSshConnection(userId, connectionId);
        List<SshScriptRecord> existing = recordStore.listAll(userId, connectionId);
        long now = System.currentTimeMillis();
        List<SshScriptRecord> ensured = SshScriptRecordBootstrap.ensureDefaults(existing, now);
        SshScriptRecordMigration.Result migrated = SshScriptRecordMigration.migrate(ensured);
        persistBootstrapChanges(userId, connectionId, existing, migrated);
        return sortForDisplay(migrated.records());
    }

    private void persistBootstrapChanges(
            long userId,
            String connectionId,
            List<SshScriptRecord> existing,
            SshScriptRecordMigration.Result migrated
    ) {
        List<SshScriptRecord> ensured = migrated.records();
        if (existing.isEmpty() && !ensured.isEmpty()) {
            for (SshScriptRecord record : ensured) {
                recordStore.upsert(userId, connectionId, record);
            }
            return;
        }
        Map<String, SshScriptRecord> before = new LinkedHashMap<>();
        for (SshScriptRecord record : existing) {
            if (record != null && record.getId() != null) {
                before.put(record.getId(), record);
            }
        }
        for (SshScriptRecord record : ensured) {
            if (record == null || record.getId() == null) {
                continue;
            }
            SshScriptRecord previous = before.get(record.getId());
            if (SshScriptRecordMigration.shouldPersist(
                    previous,
                    record,
                    migrated.lackedCommandsBefore(),
                    migrated.changedIds()
            )) {
                recordStore.upsert(userId, connectionId, record);
            }
        }
    }

    private static List<SshScriptRecord> sortForDisplay(List<SshScriptRecord> records) {
        return records.stream()
                .sorted((left, right) -> {
                    boolean leftBuiltIn = SshScriptRecordBootstrap.isBuiltInId(left.getId());
                    boolean rightBuiltIn = SshScriptRecordBootstrap.isBuiltInId(right.getId());
                    if (leftBuiltIn != rightBuiltIn) {
                        return leftBuiltIn ? -1 : 1;
                    }
                    String leftTitle = left.getTitle() != null ? left.getTitle() : "";
                    String rightTitle = right.getTitle() != null ? right.getTitle() : "";
                    int titleCompare = leftTitle.compareToIgnoreCase(rightTitle);
                    if (titleCompare != 0) {
                        return titleCompare;
                    }
                    return Long.compare(
                            right.getUpdatedAt(),
                            left.getUpdatedAt()
                    );
                })
                .toList();
    }

    public SshScriptRecord save(SaveCommand command) {
        Objects.requireNonNull(command, "command is required");
        long userId = userAccountService.requireUserId();
        requireSshConnection(userId, command.connectionId());
        SshScriptRecord record = Objects.requireNonNull(command.entry(), "entry is required");
        if (record.getId() == null || record.getId().isBlank()) {
            throw new IllegalArgumentException("entry id is required");
        }
        String title = record.getTitle() != null ? record.getTitle().trim() : "";
        if (title.isBlank()) {
            title = "Untitled";
        }
        record.setTitle(title);

        if (!SshCommandDslParser.hasCommands(record.getCommands())
                && record.getContentHtml() != null
                && !record.getContentHtml().isBlank()) {
            record.setCommands(SshCommandDslParser.parse(record.getContentHtml()));
        }
        if (SshCommandDslParser.hasCommands(record.getCommands())) {
            if (record.getContentHtml() == null || record.getContentHtml().isBlank()) {
                record.setContentHtml(SshCommandDslParser.serialize(record.getCommands()));
            }
        } else if (record.getContentHtml() == null) {
            record.setContentHtml("");
            record.setCommands(List.of());
        }

        record.setUpdatedAt(System.currentTimeMillis());
        return recordStore.upsert(userId, command.connectionId(), record);
    }

    public void delete(String connectionId, String recordId) {
        long userId = userAccountService.requireUserId();
        requireSshConnection(userId, connectionId);
        if (recordId == null || recordId.isBlank()) {
            throw new IllegalArgumentException("recordId is required");
        }
        recordStore.removeById(userId, connectionId, recordId);
    }

    private ConnectionEntity requireSshConnection(long userId, String connectionId) {
        ConnectionEntity entity = connectionVisibilityService.resolveConnectionEntity(connectionId, userId)
                .orElseThrow(() -> new IllegalArgumentException("Connection not found"));
        if (!"ssh".equalsIgnoreCase(entity.getDbType())) {
            throw new IllegalArgumentException("Connection is not an SSH datasource");
        }
        return entity;
    }
}
