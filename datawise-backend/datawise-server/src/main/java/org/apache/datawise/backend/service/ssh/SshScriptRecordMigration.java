package org.apache.datawise.backend.service.ssh;

import org.apache.datawise.backend.model.SshCommandItem;
import org.apache.datawise.backend.model.SshScriptRecord;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * In-place legacy {@code contentHtml} → {@code commands} migration helpers.
 * Extracted so persist logic can snapshot “had commands” before mutate.
 */
final class SshScriptRecordMigration {

    private SshScriptRecordMigration() {
    }

    record Result(
            List<SshScriptRecord> records,
            Set<String> lackedCommandsBefore,
            Set<String> changedIds
    ) {
    }

    static Set<String> snapshotMissingCommands(List<SshScriptRecord> records) {
        Set<String> missing = new HashSet<>();
        for (SshScriptRecord record : records) {
            if (record == null || record.getId() == null || record.getId().isBlank()) {
                continue;
            }
            if (!SshCommandDslParser.hasCommands(record.getCommands())) {
                missing.add(record.getId());
            }
        }
        return missing;
    }

    static Result migrate(List<SshScriptRecord> records) {
        Set<String> lackedCommandsBefore = snapshotMissingCommands(records);
        Set<String> changedIds = new HashSet<>();
        List<SshScriptRecord> next = new ArrayList<>(records != null ? records.size() : 0);
        if (records == null) {
            return new Result(List.of(), lackedCommandsBefore, changedIds);
        }
        for (SshScriptRecord record : records) {
            if (record == null) {
                continue;
            }
            if (!SshCommandDslParser.hasCommands(record.getCommands())
                    && record.getContentHtml() != null
                    && !record.getContentHtml().isBlank()) {
                List<SshCommandItem> parsed = SshCommandDslParser.parse(record.getContentHtml());
                if (!parsed.isEmpty()) {
                    record.setCommands(parsed);
                    changedIds.add(record.getId());
                    if (record.getContentHtml() == null || record.getContentHtml().isBlank()) {
                        record.setContentHtml(SshCommandDslParser.serialize(parsed));
                    }
                }
            } else if (SshCommandDslParser.hasCommands(record.getCommands())
                    && (record.getContentHtml() == null || record.getContentHtml().isBlank())) {
                record.setContentHtml(SshCommandDslParser.serialize(record.getCommands()));
                changedIds.add(record.getId());
            }
            next.add(record);
        }
        return new Result(next, lackedCommandsBefore, changedIds);
    }

    static boolean shouldPersist(
            SshScriptRecord previous,
            SshScriptRecord next,
            Set<String> lackedCommandsBefore,
            Set<String> changedIds
    ) {
        if (next == null || next.getId() == null) {
            return false;
        }
        if (previous == null) {
            return true;
        }
        boolean migratedCommands = lackedCommandsBefore.contains(next.getId())
                && SshCommandDslParser.hasCommands(next.getCommands());
        if (migratedCommands || changedIds.contains(next.getId())) {
            return true;
        }
        String previousHtml = previous.getContentHtml();
        String nextHtml = next.getContentHtml();
        return (previousHtml == null || previousHtml.isBlank())
                && nextHtml != null
                && !nextHtml.isBlank();
    }
}
