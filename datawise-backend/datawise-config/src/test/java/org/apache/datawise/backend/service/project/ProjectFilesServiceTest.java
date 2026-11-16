package org.apache.datawise.backend.service.project;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.ConfigPaths;
import org.apache.datawise.backend.configstore.FileProjectStore;
import org.apache.datawise.backend.configstore.UserStore;
import org.apache.datawise.backend.domain.ProjectDeleteRequest;
import org.apache.datawise.backend.domain.ProjectFileContentDto;
import org.apache.datawise.backend.domain.ProjectFileEntryDto;
import org.apache.datawise.backend.domain.ProjectFileShareRequest;
import org.apache.datawise.backend.domain.ProjectIds;
import org.apache.datawise.backend.domain.ProjectMkdirRequest;
import org.apache.datawise.backend.domain.ProjectRenameRequest;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.UserEntity;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.UserAccessPolicy;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ProjectFilesServiceTest {

    @TempDir
    Path tempDir;

    private ProjectFilesService service;
    private UserAccessPolicy accessPolicy;
    private UserStore userStore;

    @BeforeEach
    void setUp() {
        UserContext.set(1L, false, "test-session", TenantIds.DEFAULT);
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(tempDir);
        ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
        FileProjectStore projectStore = new FileProjectStore(configDirectory, objectMapper);
        projectStore.ensureDefaultProject(TenantIds.DEFAULT);
        accessPolicy = mock(UserAccessPolicy.class);
        userStore = mock(UserStore.class);
        when(userStore.findByUsername("admin")).thenReturn(Optional.empty());
        when(userStore.findById(anyLong())).thenReturn(Optional.empty());
        when(userStore.listRegisteredUsers()).thenReturn(List.of());
        ProjectService projectService = new ProjectService(
                projectStore,
                mock(),
                accessPolicy,
                configDirectory,
                mock());
        service = new ProjectFilesService(
                configDirectory, projectStore, projectService, accessPolicy, userStore, objectMapper);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void listWriteAndRejectEscape() throws Exception {
        service.write(ProjectIds.DEFAULT, new ProjectFileContentDto("docs", "notes/readme.md", "# hi"));
        List<ProjectFileEntryDto> top = service.list(ProjectIds.DEFAULT, "docs", "");
        assertTrue(top.stream().anyMatch(e -> e.directory() && "notes".equals(e.name())));

        List<ProjectFileEntryDto> nested = service.list(ProjectIds.DEFAULT, "docs", "notes");
        assertEquals(1, nested.size());
        assertEquals("readme.md", nested.get(0).name());

        ProjectFileContentDto read = service.read(ProjectIds.DEFAULT, "docs", "notes/readme.md");
        assertEquals("# hi", read.content());

        assertThrows(IllegalArgumentException.class,
                () -> service.read(ProjectIds.DEFAULT, "docs", "../outside.txt"));
        assertThrows(IllegalArgumentException.class,
                () -> service.list(ProjectIds.DEFAULT, "docs", "../../"));

        ProjectFileEntryDto dir = service.mkdir(ProjectIds.DEFAULT, new ProjectMkdirRequest("scripts", "queries"));
        assertTrue(dir.directory());
        verify(accessPolicy, atLeastOnce()).requireRegisteredUser();
        assertTrue(Files.isDirectory(tempDir.resolve(
                ConfigPaths.tenantProjectUserDir(TenantIds.DEFAULT, ProjectIds.DEFAULT, 1L) + "/scripts/queries")));
    }

    @Test
    void renameFileAndRejectConflict() throws Exception {
        service.write(ProjectIds.DEFAULT, new ProjectFileContentDto("docs", "a.txt", "one"));
        service.write(ProjectIds.DEFAULT, new ProjectFileContentDto("docs", "b.txt", "two"));

        ProjectFileEntryDto renamed = service.rename(
                ProjectIds.DEFAULT,
                new ProjectRenameRequest("docs", "a.txt", "a-renamed.txt"));
        assertEquals("a-renamed.txt", renamed.name());
        assertEquals("a-renamed.txt", renamed.path());
        assertEquals("one", service.read(ProjectIds.DEFAULT, "docs", "a-renamed.txt").content());

        assertThrows(IllegalArgumentException.class,
                () -> service.rename(ProjectIds.DEFAULT, new ProjectRenameRequest("docs", "a-renamed.txt", "b.txt")));
        assertThrows(IllegalArgumentException.class,
                () -> service.rename(ProjectIds.DEFAULT, new ProjectRenameRequest("docs", "missing.txt", "x.txt")));
    }

    @Test
    void deleteFileAndFolderRejectRoot() throws Exception {
        service.write(ProjectIds.DEFAULT, new ProjectFileContentDto("docs", "notes/readme.md", "# hi"));
        service.write(ProjectIds.DEFAULT, new ProjectFileContentDto("docs", "notes/extra.md", "x"));

        service.delete(ProjectIds.DEFAULT, new ProjectDeleteRequest("docs", "notes/extra.md"));
        assertThrows(IllegalArgumentException.class,
                () -> service.read(ProjectIds.DEFAULT, "docs", "notes/extra.md"));

        service.delete(ProjectIds.DEFAULT, new ProjectDeleteRequest("docs", "notes"));
        List<ProjectFileEntryDto> top = service.list(ProjectIds.DEFAULT, "docs", "");
        assertTrue(top.stream().noneMatch(e -> "notes".equals(e.name())));

        assertThrows(IllegalArgumentException.class,
                () -> service.delete(ProjectIds.DEFAULT, new ProjectDeleteRequest("docs", ".")));
        assertThrows(IllegalArgumentException.class,
                () -> service.delete(ProjectIds.DEFAULT, new ProjectDeleteRequest("docs", "missing.md")));
    }

    @Test
    void filesAreScopedToCreatorAccount() {
        service.write(ProjectIds.DEFAULT, new ProjectFileContentDto("docs", "admin-note.md", "admin only"));
        service.mkdir(ProjectIds.DEFAULT, new ProjectMkdirRequest("docs", "dev"));

        UserContext.set(2L, false, "other-session", TenantIds.DEFAULT);
        assertTrue(service.list(ProjectIds.DEFAULT, "docs", "").isEmpty());
        assertThrows(IllegalArgumentException.class,
                () -> service.read(ProjectIds.DEFAULT, "docs", "admin-note.md"));

        service.write(ProjectIds.DEFAULT, new ProjectFileContentDto("docs", "admin-note.md", "mine"));
        assertEquals(1, service.list(ProjectIds.DEFAULT, "docs", "").size());
        assertEquals("mine", service.read(ProjectIds.DEFAULT, "docs", "admin-note.md").content());

        UserContext.set(1L, false, "test-session", TenantIds.DEFAULT);
        assertEquals("admin only", service.read(ProjectIds.DEFAULT, "docs", "admin-note.md").content());
        assertTrue(service.list(ProjectIds.DEFAULT, "docs", "").stream()
                .anyMatch(e -> "dev".equals(e.name()) && e.directory()));
    }

    @Test
    void guestCannotSeeRegisteredUserFiles() {
        service.write(ProjectIds.DEFAULT, new ProjectFileContentDto("docs", "secret.md", "private"));
        when(accessPolicy.isGuestSession()).thenReturn(true);
        UserContext.set(9L, true, "guest-session", TenantIds.DEFAULT);

        assertTrue(service.list(ProjectIds.DEFAULT, "docs", "").isEmpty());
        assertTrue(service.listShares(ProjectIds.DEFAULT).isEmpty());
        assertThrows(IllegalArgumentException.class,
                () -> service.read(ProjectIds.DEFAULT, "docs", "secret.md"));
    }

    @Test
    void sharedFolderAppearsAsReferenceWithoutExtraRoots() {
        service.write(ProjectIds.DEFAULT, new ProjectFileContentDto("docs", "dev/handbook.md", "team doc"));
        service.write(ProjectIds.DEFAULT, new ProjectFileContentDto("docs", "private.md", "only me"));
        service.share(ProjectIds.DEFAULT, new ProjectFileShareRequest("docs", "dev"));

        UserContext.set(2L, false, "other-session", TenantIds.DEFAULT);
        List<ProjectFileEntryDto> top = service.list(ProjectIds.DEFAULT, "docs", "");
        assertEquals(1, top.size(), "只有共享引用，没有预建的共享大目录");
        ProjectFileEntryDto ref = top.get(0);
        assertEquals("dev", ref.name());
        assertEquals("@shared/u1/dev", ref.path());
        assertTrue(ref.directory());
        assertTrue(ref.shared());
        assertEquals("u1", ref.sharedBy());

        assertEquals("team doc", service.read(ProjectIds.DEFAULT, "docs", "@shared/u1/dev/handbook.md").content());
        List<ProjectFileEntryDto> children = service.list(ProjectIds.DEFAULT, "docs", "@shared/u1/dev");
        assertEquals(1, children.size());
        assertEquals("@shared/u1/dev/handbook.md", children.get(0).path());
        assertTrue(children.get(0).shared());

        assertThrows(IllegalArgumentException.class,
                () -> service.read(ProjectIds.DEFAULT, "docs", "private.md"));
    }

    @Test
    void sharedFolderCanBeEditedByOtherAccountsInPlace() {
        service.mkdir(ProjectIds.DEFAULT, new ProjectMkdirRequest("docs", "runbooks"));
        service.share(ProjectIds.DEFAULT, new ProjectFileShareRequest("docs", "runbooks"));

        UserContext.set(2L, false, "other-session", TenantIds.DEFAULT);
        service.write(ProjectIds.DEFAULT,
                new ProjectFileContentDto("docs", "@shared/u1/runbooks/deploy.md", "from teammate"));

        UserContext.set(1L, false, "test-session", TenantIds.DEFAULT);
        assertEquals("from teammate", service.read(ProjectIds.DEFAULT, "docs", "runbooks/deploy.md").content());
        assertTrue(Files.isRegularFile(tempDir.resolve(
                ConfigPaths.tenantProjectUserDir(TenantIds.DEFAULT, ProjectIds.DEFAULT, 1L)
                        + "/docs/runbooks/deploy.md")));
    }

    @Test
    void sharedRefCannotEscapeDeclaredShareScope() {
        service.write(ProjectIds.DEFAULT, new ProjectFileContentDto("docs", "dev/open.md", "open"));
        service.write(ProjectIds.DEFAULT, new ProjectFileContentDto("docs", "secret.md", "private"));
        service.share(ProjectIds.DEFAULT, new ProjectFileShareRequest("docs", "dev"));

        UserContext.set(2L, false, "other-session", TenantIds.DEFAULT);
        assertThrows(IllegalArgumentException.class,
                () -> service.read(ProjectIds.DEFAULT, "docs", "@shared/u1/secret.md"));
        assertThrows(IllegalArgumentException.class,
                () -> service.list(ProjectIds.DEFAULT, "docs", "@shared/u1/dev/../secret.md"));
        assertThrows(IllegalArgumentException.class,
                () -> service.read(ProjectIds.DEFAULT, "docs", "@shared/u3/dev/open.md"));
    }

    @Test
    void unshareRemovesReferenceAndOnlyOwnerCanUnshare() {
        service.write(ProjectIds.DEFAULT, new ProjectFileContentDto("docs", "dev/open.md", "open"));
        service.share(ProjectIds.DEFAULT, new ProjectFileShareRequest("docs", "dev"));

        UserContext.set(2L, false, "other-session", TenantIds.DEFAULT);
        service.unshare(ProjectIds.DEFAULT, new ProjectFileShareRequest("docs", "dev"));
        assertEquals(1, service.list(ProjectIds.DEFAULT, "docs", "").size(),
                "其它账号不能取消别人的共享");

        UserContext.set(1L, false, "test-session", TenantIds.DEFAULT);
        service.unshare(ProjectIds.DEFAULT, new ProjectFileShareRequest("docs", "dev"));
        assertTrue(service.listShares(ProjectIds.DEFAULT).isEmpty());

        UserContext.set(2L, false, "other-session", TenantIds.DEFAULT);
        assertTrue(service.list(ProjectIds.DEFAULT, "docs", "").isEmpty());
        assertThrows(IllegalArgumentException.class,
                () -> service.read(ProjectIds.DEFAULT, "docs", "@shared/u1/dev/open.md"));
    }

    @Test
    void shareRequiresExistingDirectoryAndRejectsNested() {
        assertThrows(IllegalArgumentException.class,
                () -> service.share(ProjectIds.DEFAULT, new ProjectFileShareRequest("docs", "missing")));
        service.mkdir(ProjectIds.DEFAULT, new ProjectMkdirRequest("docs", "dev/api"));
        service.share(ProjectIds.DEFAULT, new ProjectFileShareRequest("docs", "dev/api"));
        assertEquals("dev/api", service.listShares(ProjectIds.DEFAULT).get(0).path());

        // 共享父目录会合并掉子目录的共享记录，避免树里出现重复引用。
        service.share(ProjectIds.DEFAULT, new ProjectFileShareRequest("docs", "dev"));
        assertEquals(1, service.listShares(ProjectIds.DEFAULT).size());
        assertEquals("dev", service.listShares(ProjectIds.DEFAULT).get(0).path());
        assertEquals(1L, service.listShares(ProjectIds.DEFAULT).get(0).ownerUserId());

        assertThrows(IllegalArgumentException.class,
                () -> service.share(ProjectIds.DEFAULT, new ProjectFileShareRequest("docs", "dev/api")));
    }

    @Test
    void renameAndDeleteKeepShareRecordsInSync() {
        service.mkdir(ProjectIds.DEFAULT, new ProjectMkdirRequest("docs", "dev"));
        service.share(ProjectIds.DEFAULT, new ProjectFileShareRequest("docs", "dev"));

        service.rename(ProjectIds.DEFAULT, new ProjectRenameRequest("docs", "dev", "dev-renamed"));
        assertEquals("dev-renamed", service.listShares(ProjectIds.DEFAULT).get(0).path());

        service.delete(ProjectIds.DEFAULT, new ProjectDeleteRequest("docs", "dev-renamed"));
        assertTrue(service.listShares(ProjectIds.DEFAULT).isEmpty());
    }

    @Test
    void crossScopeMoveIsRejected() {
        service.mkdir(ProjectIds.DEFAULT, new ProjectMkdirRequest("docs", "dev"));
        service.write(ProjectIds.DEFAULT, new ProjectFileContentDto("docs", "local.md", "mine"));
        service.share(ProjectIds.DEFAULT, new ProjectFileShareRequest("docs", "dev"));

        UserContext.set(2L, false, "other-session", TenantIds.DEFAULT);
        assertThrows(IllegalArgumentException.class, () -> service.rename(
                ProjectIds.DEFAULT,
                new ProjectRenameRequest("docs", "local.md", "@shared/u1/dev/local.md")));
    }

    @Test
    void nonOwnerCannotDeleteOrRenameTheSharedRootDirectory() {
        service.mkdir(ProjectIds.DEFAULT, new ProjectMkdirRequest("docs", "dev"));
        service.share(ProjectIds.DEFAULT, new ProjectFileShareRequest("docs", "dev"));

        UserContext.set(2L, false, "other-session", TenantIds.DEFAULT);
        assertThrows(IllegalArgumentException.class,
                () -> service.delete(ProjectIds.DEFAULT,
                        new ProjectDeleteRequest("docs", "@shared/u1/dev")));
        assertThrows(IllegalArgumentException.class, () -> service.rename(
                ProjectIds.DEFAULT,
                new ProjectRenameRequest("docs", "@shared/u1/dev", "@shared/u1/dev2")));

        UserContext.set(1L, false, "test-session", TenantIds.DEFAULT);
        assertTrue(Files.isDirectory(tempDir.resolve(
                ConfigPaths.tenantProjectUserDir(TenantIds.DEFAULT, ProjectIds.DEFAULT, 1L) + "/docs/dev")));
    }

    @Test
    void ensureRootsCreatesTwoEmptyDirectoriesForEveryAccount() throws Exception {
        service.write(ProjectIds.DEFAULT, new ProjectFileContentDto("docs", "admin.md", "admin only"));

        UserContext.set(2L, false, "other-session", TenantIds.DEFAULT);
        service.ensureRootsForCurrentUser(ProjectIds.DEFAULT);
        Path privateDocs = tempDir.resolve(
                ConfigPaths.tenantProjectUserDir(TenantIds.DEFAULT, ProjectIds.DEFAULT, 2L) + "/docs");
        Path privateScripts = tempDir.resolve(
                ConfigPaths.tenantProjectUserDir(TenantIds.DEFAULT, ProjectIds.DEFAULT, 2L) + "/scripts");
        assertTrue(Files.isDirectory(privateDocs));
        assertTrue(Files.isDirectory(privateScripts));
        try (Stream<Path> entries = Files.list(privateDocs)) {
            assertEquals(0, entries.count());
        }
        assertTrue(service.list(ProjectIds.DEFAULT, "docs", "").isEmpty());
        assertFalse(Files.exists(tempDir.resolve(
                ConfigPaths.tenantProjectDir(TenantIds.DEFAULT, ProjectIds.DEFAULT) + "/shared")));

        UserContext.set(3L, false, "third-session", TenantIds.DEFAULT);
        service.ensureRootsForCurrentUser(ProjectIds.DEFAULT);
        assertTrue(Files.isDirectory(tempDir.resolve(
                ConfigPaths.tenantProjectUserDir(TenantIds.DEFAULT, ProjectIds.DEFAULT, 3L) + "/docs")));
        assertTrue(Files.isDirectory(tempDir.resolve(
                ConfigPaths.tenantProjectUserDir(TenantIds.DEFAULT, ProjectIds.DEFAULT, 3L) + "/scripts")));
    }

    @Test
    void legacyProjectFilesAreAssignedToAdmin() throws Exception {
        UserEntity admin = new UserEntity();
        admin.setId(42L);
        admin.setUsername("admin");
        when(userStore.findByUsername("admin")).thenReturn(Optional.of(admin));

        Path legacyDocs = tempDir.resolve(
                ConfigPaths.tenantProjectDir(TenantIds.DEFAULT, ProjectIds.DEFAULT) + "/docs");
        Files.createDirectories(legacyDocs);
        Files.writeString(legacyDocs.resolve("dev.md"), "created by admin");
        Path ownedByAdmin = tempDir.resolve(
                ConfigPaths.tenantProjectUserDir(TenantIds.DEFAULT, ProjectIds.DEFAULT, 42L) + "/docs/dev.md");

        assertTrue(service.list(ProjectIds.DEFAULT, "docs", "").isEmpty());
        assertTrue(Files.isRegularFile(ownedByAdmin));
        assertEquals("created by admin", Files.readString(ownedByAdmin));

        UserContext.set(42L, false, "admin-session", TenantIds.DEFAULT);
        assertEquals(1, service.list(ProjectIds.DEFAULT, "docs", "").size());
        assertEquals("created by admin", service.read(ProjectIds.DEFAULT, "docs", "dev.md").content());
    }
}
