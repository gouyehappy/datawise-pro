package org.apache.datawise.backend.service.ssh;

import org.apache.datawise.backend.model.SshScriptRecord;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SshScriptRecordBootstrapTest {

    @Test
    void seedsBuiltInsOnlyWhenStoreIsEmpty() {
        List<SshScriptRecord> seeded = SshScriptRecordBootstrap.ensureDefaults(List.of(), 1L);
        assertTrue(seeded.size() >= 6);
        assertTrue(seeded.stream().anyMatch(record -> "builtin-logs".equals(record.getId())));
        assertTrue(seeded.stream().anyMatch(record -> "builtin-mongodb".equals(record.getId())));
        assertTrue(seeded.stream().anyMatch(record -> "builtin-common".equals(record.getId())));
        SshScriptRecord logs = seeded.stream()
                .filter(record -> "builtin-logs".equals(record.getId()))
                .findFirst()
                .orElseThrow();
        assertTrue(SshCommandDslParser.hasCommands(logs.getCommands()));
        assertEquals("run", logs.getCommands().get(0).getMode());
    }

    @Test
    void appendsMissingBuiltInsWhenStoreHasCustomOnly() {
        SshScriptRecord custom = new SshScriptRecord("custom-1", "Custom", "<pre>echo hi</pre>", 1L);
        List<SshScriptRecord> ensured = SshScriptRecordBootstrap.ensureDefaults(List.of(custom), 2L);
        assertTrue(ensured.size() >= 7);
        assertTrue(ensured.stream().anyMatch(record -> "custom-1".equals(record.getId())));
        assertTrue(ensured.stream().anyMatch(record -> "builtin-mongodb".equals(record.getId())));
        assertTrue(ensured.stream().anyMatch(record -> "builtin-yarn".equals(record.getId())));
    }

    @Test
    void repairsBlankBuiltinContentInPlace() {
        SshScriptRecord blank = new SshScriptRecord("builtin-status", "状态", "", 1L);
        blank.setCommands(List.of());
        List<SshScriptRecord> ensured = SshScriptRecordBootstrap.ensureDefaults(List.of(blank), 2L);
        assertTrue(ensured.size() >= 6);
        SshScriptRecord status = ensured.stream()
                .filter(record -> "builtin-status".equals(record.getId()))
                .findFirst()
                .orElseThrow();
        assertTrue(SshCommandDslParser.hasCommands(status.getCommands()));
        assertTrue(status.getContentHtml() != null && !status.getContentHtml().isBlank());
        assertTrue(status.getContentHtml().contains("uptime"));
        assertTrue(status.getContentHtml().contains("=== host ==="));
        assertTrue(ensured.stream().anyMatch(record -> "builtin-mongodb".equals(record.getId())));
    }

    @Test
    void appendsInspectionToExistingStatusCommands() {
        SshScriptRecord status = new SshScriptRecord();
        status.setId("builtin-status");
        status.setTitle("状态");
        status.setCommands(List.of(new org.apache.datawise.backend.model.SshCommandItem(
                "运行时间", "uptime", "run", ""
        )));
        status.setContentHtml("@run\n# 运行时间\nuptime\n");
        List<SshScriptRecord> ensured = SshScriptRecordBootstrap.ensureDefaults(List.of(status), 3L);
        SshScriptRecord updated = ensured.stream()
                .filter(record -> "builtin-status".equals(record.getId()))
                .findFirst()
                .orElseThrow();
        assertTrue(updated.getCommands().get(0).getCommand().contains("=== host ==="));
        assertEquals("uptime", updated.getCommands().get(1).getCommand());
    }

    @Test
    void parserAppliesSectionalModes() {
        List<org.apache.datawise.backend.model.SshCommandItem> parsed = SshCommandDslParser.parse("""
                @paste
                # 服务
                192.0.2.53
                @run
                # 启动
                trino --server localhost:18080
                # 查看catalog
                show catalogs;
                """);
        assertEquals(3, parsed.size());
        assertEquals("paste", parsed.get(0).getMode());
        assertEquals("服务", parsed.get(0).getTitle());
        assertEquals("run", parsed.get(1).getMode());
        assertEquals("run", parsed.get(2).getMode());
        assertFalse(parsed.get(0).getCommand().isBlank());
    }

    @Test
    void serializerRoundTripsSectionalModes() {
        var parsed = SshCommandDslParser.parse("""
                @paste
                # 服务
                192.0.2.53
                @run
                uptime
                """);
        String serialized = SshCommandDslParser.serialize(parsed);
        var again = SshCommandDslParser.parse(serialized);
        assertEquals(parsed.size(), again.size());
        assertEquals(parsed.get(0).getMode(), again.get(0).getMode());
        assertEquals(parsed.get(1).getMode(), again.get(1).getMode());
        assertEquals(parsed.get(0).getCommand(), again.get(0).getCommand());
    }

    @Test
    void parseStripsLegacyHtmlBeforeExtractingCommands() {
        var parsed = SshCommandDslParser.parse("<pre>@run\n# 磁盘\ndf -h</pre>");
        assertEquals(1, parsed.size());
        assertEquals("run", parsed.get(0).getMode());
        assertEquals("磁盘", parsed.get(0).getTitle());
        assertEquals("df -h", parsed.get(0).getCommand());
    }

    @Test
    void parseSupportsDescriptionAndIgnoresHashComments() {
        var parsed = SshCommandDslParser.parse("""
                @run
                ## this is not a label
                # 磁盘 :: 查看磁盘使用
                df -h
                # :: 仅描述
                uptime
                """);
        assertEquals(2, parsed.size());
        assertEquals("磁盘", parsed.get(0).getTitle());
        assertEquals("查看磁盘使用", parsed.get(0).getDescription());
        assertEquals("df -h", parsed.get(0).getCommand());
        assertEquals("", parsed.get(1).getTitle());
        assertEquals("仅描述", parsed.get(1).getDescription());
        assertEquals("uptime", parsed.get(1).getCommand());
    }

    @Test
    void toExecutableTextOmitsMetaLines() {
        var parsed = SshCommandDslParser.parse("""
                @paste
                # 服务
                192.0.2.53
                @run
                uptime
                """);
        assertEquals("192.0.2.53\nuptime\n", SshCommandDslParser.toExecutableText(parsed));
    }
}
