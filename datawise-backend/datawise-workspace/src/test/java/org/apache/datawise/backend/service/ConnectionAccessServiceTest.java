package org.apache.datawise.backend.service;

import org.apache.datawise.backend.common.ConnectionAccessDeniedException;
import org.apache.datawise.backend.configstore.ConnectionStore;
import org.apache.datawise.backend.configstore.TeamStore;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.TeamEntity;
import org.apache.datawise.backend.model.TeamMemberEntity;
import org.apache.datawise.backend.common.support.ConnectionAccessLevel;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ConnectionAccessServiceTest {

    @TempDir
    Path tempDir;

    @Mock
    private ConnectionStore connectionStore;

    @Mock
    private WriteUnlockService writeUnlockService;

    private TeamStore teamStore;
    private ConnectionAccessService service;

    @BeforeEach
    void setUp() throws Exception {
        teamStore = TestTeamStoreFactory.create(tempDir);
        service = new ConnectionAccessService(teamStore, connectionStore, writeUnlockService);
    }

    @Test
    void unknownConnectionDefaultsToReadonly() {
        when(connectionStore.findConnectionById("conn-private")).thenReturn(Optional.empty());
        assertEquals(ConnectionAccessLevel.READONLY, service.resolveAccess(2L, "conn-private"));
    }

    @Test
    void ownedConnectionDefaultsToDdl() {
        ConnectionEntity owned = connection("conn-owned", 2L);
        when(connectionStore.findConnectionById("conn-owned")).thenReturn(Optional.of(owned));
        assertEquals(ConnectionAccessLevel.DDL, service.resolveAccess(2L, "conn-owned"));
    }

    @Test
    void ownedWriteGuardIsReadonlyUntilUnlocked() {
        ConnectionEntity owned = connection("conn-guard", 2L);
        owned.setWriteGuard(true);
        when(connectionStore.findConnectionById("conn-guard")).thenReturn(Optional.of(owned));
        when(writeUnlockService.isUnlockedForCurrentUiSession(2L, "conn-guard")).thenReturn(false);
        assertEquals(ConnectionAccessLevel.READONLY, service.resolveAccess(2L, "conn-guard"));

        when(writeUnlockService.isUnlockedForCurrentUiSession(2L, "conn-guard")).thenReturn(true);
        assertEquals(ConnectionAccessLevel.DDL, service.resolveAccess(2L, "conn-guard"));
    }

    @Test
    void ownedConnectionKeepsDdlEvenWhenTeamShareIsReadonly() {
        ConnectionEntity owned = connection("conn-1", 2L);
        when(connectionStore.findConnectionById("conn-1")).thenReturn(Optional.of(owned));
        seedTeam("team-1", List.of("conn-1"), Map.of("conn-1", "readonly"), 1L);
        seedMember("team-1", 2L, "member");
        assertEquals(ConnectionAccessLevel.DDL, service.resolveAccess(2L, "conn-1"));
    }

    @Test
    void legacyConnectionWithoutOwnerDefaultsToReadonly() {
        ConnectionEntity legacy = connection("conn-legacy", null);
        when(connectionStore.findConnectionById("conn-legacy")).thenReturn(Optional.of(legacy));
        assertEquals(ConnectionAccessLevel.READONLY, service.resolveAccess(2L, "conn-legacy"));
    }

    @Test
    void viewerOnSharedConnectionIsReadOnly() {
        seedTeam("team-1", List.of("conn-1"), Map.of(), 1L);
        seedMember("team-1", 2L, "viewer");
        assertEquals(ConnectionAccessLevel.READONLY, service.resolveAccess(2L, "conn-1"));
    }

    @Test
    void memberRespectsReadonlyAccessMap() {
        seedTeam("team-1", List.of("conn-1"), Map.of("conn-1", "readonly"), 1L);
        seedMember("team-1", 2L, "member");
        assertEquals(ConnectionAccessLevel.READONLY, service.resolveAccess(2L, "conn-1"));
    }

    @Test
    void memberRespectsLegacyReadAccessMap() {
        seedTeam("team-1", List.of("conn-1"), Map.of("conn-1", "read"), 1L);
        seedMember("team-1", 2L, "member");
        assertEquals(ConnectionAccessLevel.READONLY, service.resolveAccess(2L, "conn-1"));
    }

    @Test
    void memberRespectsReadwriteAccessMap() {
        seedTeam("team-1", List.of("conn-1"), Map.of("conn-1", "readwrite"), 1L);
        seedMember("team-1", 2L, "member");
        assertEquals(ConnectionAccessLevel.READWRITE, service.resolveAccess(2L, "conn-1"));
    }

    @Test
    void memberDefaultsToDdlWhenAccessNotConfigured() {
        seedTeam("team-1", List.of("conn-1"), Map.of(), 1L);
        seedMember("team-1", 2L, "member");
        assertEquals(ConnectionAccessLevel.DDL, service.resolveAccess(2L, "conn-1"));
    }

    @Test
    void adminOnSharedConnectionCanUseDdl() {
        seedTeam("team-1", List.of("conn-1"), Map.of("conn-1", "readonly"), 1L);
        seedMember("team-1", 2L, "admin");
        assertEquals(ConnectionAccessLevel.DDL, service.resolveAccess(2L, "conn-1"));
    }

    @Test
    void requireDmlAccessThrowsForReadOnly() {
        seedTeam("team-1", List.of("conn-1"), Map.of("conn-1", "readonly"), 1L);
        seedMember("team-1", 2L, "member");
        ConnectionAccessDeniedException ex = assertThrows(
                ConnectionAccessDeniedException.class,
                () -> service.requireDmlAccess(2L, "conn-1")
        );
        assertEquals("conn-1", ex.getConnectionId());
        assertEquals(2L, ex.getUserId());
        assertEquals("DML", ex.getRequiredAccess());
        assertEquals("READONLY", ex.getActualAccess());
        assertEquals("requireDmlAccess", ex.getOperation());
    }

    @Test
    void requireDdlAccessThrowsForReadwrite() {
        seedTeam("team-1", List.of("conn-1"), Map.of("conn-1", "readwrite"), 1L);
        seedMember("team-1", 2L, "member");
        assertThrows(ConnectionAccessDeniedException.class, () -> service.requireDdlAccess(2L, "conn-1"));
    }

    @Test
    void requireSqlWriteAccessAllowsDmlOnReadwrite() {
        seedTeam("team-1", List.of("conn-1"), Map.of("conn-1", "readwrite"), 1L);
        seedMember("team-1", 2L, "member");
        service.requireSqlWriteAccess(2L, "conn-1", "UPDATE t SET a = 1");
    }

    @Test
    void requireSqlWriteAccessBlocksDdlOnReadwrite() {
        seedTeam("team-1", List.of("conn-1"), Map.of("conn-1", "readwrite"), 1L);
        seedMember("team-1", 2L, "member");
        assertThrows(
                ConnectionAccessDeniedException.class,
                () -> service.requireSqlWriteAccess(2L, "conn-1", "CREATE TABLE t (id INT)")
        );
    }

    @Test
    void requireEngineFeatureBlocksRedisQueryExecution() {
        ConnectionEntity redis = connection("conn-redis", 2L);
        redis.setDbType("redis");
        when(connectionStore.findConnectionById("conn-redis")).thenReturn(Optional.of(redis));
        ConnectionAccessDeniedException ex = assertThrows(
                ConnectionAccessDeniedException.class,
                () -> service.requireEngineFeature(2L, "conn-redis", "queryExecution")
        );
        assertEquals("capability:queryExecution", ex.getOperation());
        assertEquals("queryExecution", ex.getRequiredAccess());
    }

    @Test
    void requireEngineFeatureAllowsMysqlQueryExecution() {
        ConnectionEntity mysql = connection("conn-mysql", 2L);
        when(connectionStore.findConnectionById("conn-mysql")).thenReturn(Optional.of(mysql));
        service.requireEngineFeature(2L, "conn-mysql", "queryExecution");
    }

    @Test
    void requireEngineFeatureBlocksRedisSchemaCompare() {
        ConnectionEntity redis = connection("conn-redis", 2L);
        redis.setDbType("redis");
        when(connectionStore.findConnectionById("conn-redis")).thenReturn(Optional.of(redis));
        assertThrows(
                ConnectionAccessDeniedException.class,
                () -> service.requireEngineFeature(2L, "conn-redis", "schemaCompare")
        );
    }

    private void seedTeam(String id, List<String> sharedConnections, Map<String, String> access, Long ownerId) {
        TeamEntity team = new TeamEntity();
        team.setId(id);
        team.setName("Team");
        team.setOwnerUserId(ownerId);
        team.setInviteCode("abc12345");
        team.setCreatedAt(Instant.now());
        team.setSharedConnectionIds(sharedConnections);
        team.setSharedConnectionAccess(access);
        teamStore.saveTeam(team);
    }

    private void seedMember(String teamId, Long userId, String role) {
        TeamMemberEntity member = new TeamMemberEntity();
        member.setTeamId(teamId);
        member.setUserId(userId);
        member.setRole(role);
        member.setJoinedAt(Instant.now());
        teamStore.saveMember(member);
    }

    private static ConnectionEntity connection(String id, Long userId) {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setId(id);
        entity.setGroupId("group-1");
        entity.setUserId(userId);
        entity.setName(id);
        entity.setDbType("mysql");
        entity.setSortOrder(0);
        return entity;
    }
}
