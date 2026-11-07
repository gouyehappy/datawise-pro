package org.apache.datawise.backend.service.ssh;

import org.apache.datawise.backend.model.SshScriptRecord;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SshScriptRecordMigrationTest {

    @Test
    void migratePersistsWhenSameInstanceLackedCommands() {
        SshScriptRecord legacy = new SshScriptRecord(
                "r1",
                "Trino",
                "@paste\n# 服务\n192.0.2.53\n@run\nuptime\n",
                1L
        );
        legacy.setCommands(new ArrayList<>());
        List<SshScriptRecord> records = new ArrayList<>(List.of(legacy));

        SshScriptRecordMigration.Result result = SshScriptRecordMigration.migrate(records);

        assertTrue(result.lackedCommandsBefore().contains("r1"));
        assertTrue(result.changedIds().contains("r1"));
        assertTrue(SshCommandDslParser.hasCommands(legacy.getCommands()));
        assertEquals(2, legacy.getCommands().size());
        assertEquals("paste", legacy.getCommands().get(0).getMode());
        assertEquals("run", legacy.getCommands().get(1).getMode());

        // previous == next (same instance) must still persist via snapshot flags
        assertTrue(SshScriptRecordMigration.shouldPersist(
                legacy,
                legacy,
                result.lackedCommandsBefore(),
                result.changedIds()
        ));
    }

    @Test
    void migrateParsesLegacyHtmlWithoutPoisoningCommands() {
        SshScriptRecord legacy = new SshScriptRecord(
                "r-html",
                "状态",
                "<pre>@run\n# 磁盘\ndf -h</pre>",
                1L
        );
        legacy.setCommands(List.of());

        SshScriptRecordMigration.Result result = SshScriptRecordMigration.migrate(List.of(legacy));

        assertTrue(result.changedIds().contains("r-html"));
        assertEquals(1, legacy.getCommands().size());
        assertEquals("df -h", legacy.getCommands().get(0).getCommand());
        assertEquals("磁盘", legacy.getCommands().get(0).getTitle());
        assertFalse(legacy.getCommands().get(0).getCommand().contains("<"));
    }

    @Test
    void shouldNotPersistWhenAlreadyStructuredAndUnchanged() {
        SshScriptRecord record = new SshScriptRecord("r2", "ok", "@run\nuptime\n", 1L);
        record.setCommands(SshCommandDslParser.parse(record.getContentHtml()));

        SshScriptRecordMigration.Result result = SshScriptRecordMigration.migrate(List.of(record));

        assertFalse(result.lackedCommandsBefore().contains("r2"));
        assertFalse(result.changedIds().contains("r2"));
        assertFalse(SshScriptRecordMigration.shouldPersist(
                record,
                record,
                result.lackedCommandsBefore(),
                result.changedIds()
        ));
    }
}
