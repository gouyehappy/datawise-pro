package org.apache.datawise.backend.service;

import org.apache.datawise.backend.domain.InstanceSqlFileDto;
import org.apache.datawise.backend.domain.ReadInstanceSqlResult;
import org.apache.datawise.backend.domain.RenameInstanceSqlRequest;
import org.apache.datawise.backend.domain.SaveInstanceSqlRequest;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.schema.SchemaNodeIds;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class InstanceWorkspaceServiceTest {

    @TempDir
    Path tempDir;

    private InstanceWorkspaceService service;

    @BeforeEach
    void setUp() {
        service = InstanceWorkspaceAssembly.forTest(tempDir);
    }

    @Test
    void saveListAndReadSqlRoundTrip() throws IOException {
        service.saveSql(new SaveInstanceSqlRequest(
                "conn-1",
                null,
                "mydb",
                "SELECT 1;",
                "console.sql"
        ));

        List<TreeNode> files = service.listSqlFileNodes("conn-1", "mydb");
        assertEquals(1, files.size());
        assertEquals("console.sql", files.get(0).getLabel());
        assertEquals("sql_file", files.get(0).getType());

        String sql = service.readSql("conn-1", "mydb", "console.sql");
        assertEquals("SELECT 1;", sql);
    }

    @Test
    void listSqlFilesIgnoresNonSqlFiles() throws IOException {
        Path workspaceDir = tempDir
                .resolve("conn-1")
                .resolve("mydb");
        Files.createDirectories(workspaceDir);
        Files.writeString(workspaceDir.resolve("notes.txt"), "ignore");
        Files.writeString(workspaceDir.resolve("query.sql"), "SELECT 2;");

        List<TreeNode> files = service.listSqlFileNodes("conn-1", "mydb");
        assertEquals(1, files.size());
        assertEquals("query.sql", files.get(0).getLabel());
    }

    @Test
    void readLatestSqlFilePicksMostRecentlyModified() throws IOException {
        Path workspaceDir = tempDir
                .resolve("conn-1")
                .resolve("mydb");
        Files.createDirectories(workspaceDir);

        Path older = workspaceDir.resolve("older.sql");
        Path newer = workspaceDir.resolve("newer.sql");
        Files.writeString(older, "SELECT old;");
        Files.writeString(newer, "SELECT new;");
        Files.setLastModifiedTime(older, FileTime.fromMillis(1_000L));
        Files.setLastModifiedTime(newer, FileTime.fromMillis(2_000L));

        ReadInstanceSqlResult latest = service.readLatestSqlFile("conn-1", "mydb");
        assertEquals("newer.sql", latest.fileName());
        assertEquals("SELECT new;", latest.sql());
    }

    @Test
    void renameSqlFileMovesFileOnDisk() throws IOException {
        service.saveSql(new SaveInstanceSqlRequest(
                "conn-1",
                null,
                "mydb",
                "SELECT 1;",
                "console.sql"
        ));

        var result = service.renameSqlFile(new RenameInstanceSqlRequest(
                "conn-1",
                "mydb",
                "console.sql",
                "burying_business"
        ));

        assertEquals("burying_business.sql", result.fileName());
        assertEquals("SELECT 1;", service.readSql("conn-1", "mydb", "burying_business.sql"));

        List<TreeNode> files = service.listSqlFileNodes("conn-1", "mydb");
        assertEquals(1, files.size());
        assertEquals("burying_business.sql", files.get(0).getLabel());
    }

    @Test
    void listSqlScriptsReturnsSortedByModifiedTimeDesc() throws IOException {
        Path workspaceDir = tempDir
                .resolve("conn-1")
                .resolve("mydb");
        Files.createDirectories(workspaceDir);

        Path older = workspaceDir.resolve("Script-1.sql");
        Path newer = workspaceDir.resolve("Script-2.sql");
        Files.writeString(older, "SELECT old;");
        Files.writeString(newer, "SELECT new;");
        Files.setLastModifiedTime(older, FileTime.fromMillis(1_000L));
        Files.setLastModifiedTime(newer, FileTime.fromMillis(2_000L));

        List<InstanceSqlFileDto> scripts = service.listSqlScripts("conn-1", "mydb", false);
        assertEquals(2, scripts.size());
        assertEquals("Script-2.sql", scripts.get(0).fileName());
        assertEquals("Script-1.sql", scripts.get(1).fileName());
        assertEquals("conn-1", scripts.get(0).connectionId());
        assertEquals("mydb", scripts.get(0).instanceName());
        assertTrue(scripts.get(0).preview().contains("SELECT new"));
    }

    @Test
    void deleteSqlFileRemovesFileFromDisk() throws IOException {
        service.saveSql(new SaveInstanceSqlRequest(
                "conn-1",
                null,
                "mydb",
                "SELECT 1;",
                "Script-1.sql"
        ));

        service.deleteSqlFile("conn-1", "mydb", "Script-1.sql");

        assertEquals(0, service.listSqlFileNodes("conn-1", "mydb").size());
        assertEquals("", service.readSql("conn-1", "mydb", "Script-1.sql"));
    }

    @Test
    void cjkSqlFilesGetDistinctTreeNodeIds() throws IOException {
        Path workspaceDir = tempDir.resolve("conn-1").resolve("mydb");
        Files.createDirectories(workspaceDir);
        Files.writeString(workspaceDir.resolve("智能分群.sql"), "SELECT 1;");
        Files.writeString(workspaceDir.resolve("智能标签.sql"), "SELECT 2;");

        List<TreeNode> files = service.listSqlFileNodes("conn-1", "mydb");
        assertEquals(2, files.size());
        assertNotEquals(files.get(0).getId(), files.get(1).getId());
        assertEquals(
                SchemaNodeIds.workspaceSqlFileNodeId("conn-1", "mydb", "智能分群.sql"),
                files.stream().filter(node -> "智能分群.sql".equals(node.getLabel())).findFirst().orElseThrow().getId());
    }

    @Test
    void readMissingFileReturnsEmptyString() throws IOException {
        assertEquals("", service.readSql("conn-1", "missing", "console.sql"));
    }

    @Test
    void catalogSchemaInstanceKeyUsesSingleDirectorySegment() throws IOException {
        service.saveSql(new SaveInstanceSqlRequest(
                "conn-trino",
                null,
                "kudu.a003",
                "SELECT 1;",
                "Script-1.sql"
        ));

        List<TreeNode> files = service.listSqlFileNodes("conn-trino", "kudu.a003");
        assertEquals(1, files.size());
        assertEquals("Script-1.sql", files.get(0).getLabel());
        assertTrue(Files.isRegularFile(tempDir.resolve("conn-trino").resolve("kudu.a003").resolve("Script-1.sql")));
    }

    @Test
    void saveChangedSqlCreatesHistoryEntry() throws IOException {
        service.saveSql(new SaveInstanceSqlRequest(
                "conn-1",
                null,
                "mydb",
                "SELECT 1;",
                "query.sql"
        ));
        service.saveSql(new SaveInstanceSqlRequest(
                "conn-1",
                null,
                "mydb",
                "SELECT 2;",
                "query.sql"
        ));

        var history = service.listSqlHistory("conn-1", "mydb", "query.sql");
        assertEquals(1, history.size());
        assertEquals("SELECT 1;", service.readSqlHistoryVersion(
                "conn-1",
                "mydb",
                "query.sql",
                history.get(0).versionId()
        ).sql());
    }

    @Test
    void restoreSqlHistoryVersionWritesMainFile() throws IOException {
        service.saveSql(new SaveInstanceSqlRequest(
                "conn-1",
                null,
                "mydb",
                "SELECT 1;",
                "query.sql"
        ));
        service.saveSql(new SaveInstanceSqlRequest(
                "conn-1",
                null,
                "mydb",
                "SELECT 2;",
                "query.sql"
        ));
        var history = service.listSqlHistory("conn-1", "mydb", "query.sql");
        service.restoreSqlHistoryVersion("conn-1", "mydb", "query.sql", history.get(0).versionId());
        assertEquals("SELECT 1;", service.readSql("conn-1", "mydb", "query.sql"));
    }
}
