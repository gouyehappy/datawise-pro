package org.apache.datawise.backend.service;

import org.apache.datawise.backend.common.ProductionWriteBlockedException;
import org.apache.datawise.backend.configstore.TeamStore;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.TeamEntity;
import org.apache.datawise.backend.model.TeamMemberEntity;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ProductionWriteGuardServiceTest {

    @TempDir
    Path tempDir;

    private TeamStore teamStore;
    private ProductionWriteGuardService service;

    @BeforeEach
    void setUp() throws Exception {
        teamStore = TestTeamStoreFactory.create(tempDir);
        service = new ProductionWriteGuardService(teamStore);
        seedTeam("team-1", List.of("conn-prod", "conn-prod-2"), Map.of(), 1L);
        seedMember("team-1", 2L, "member");
        seedMember("team-1", 3L, "admin");
    }

    @Test
    void selectOnProdDoesNotRequireApproval() {
        assertFalse(service.requiresProductionApproval(2L, prodConnection("conn-prod"), "SELECT 1"));
    }

    @Test
    void writeOnDevDoesNotRequireApproval() {
        ConnectionEntity dev = prodConnection("conn-prod");
        dev.setEnv("dev");
        assertFalse(service.requiresProductionApproval(2L, dev, "UPDATE t SET a = 1"));
    }

    @Test
    void writeOnProdWithoutTeamShareDoesNotRequireApproval() {
        assertFalse(service.requiresProductionApproval(2L, prodConnection("conn-private"), "UPDATE t SET a = 1"));
    }

    @Test
    void memberWriteOnSharedProdRequiresApproval() {
        assertTrue(service.requiresProductionApproval(
                2L,
                prodConnection("conn-prod"),
                "UPDATE t SET a = 1 WHERE id = 1"
        ));
    }

    @Test
    void adminWriteOnSharedProdRequiresApproval_makerChecker() {
        assertTrue(service.requiresProductionApproval(
                3L,
                prodConnection("conn-prod"),
                "UPDATE t SET a = 1 WHERE id = 1"
        ));
    }

    @Test
    void customEnvContainingProdRequiresApproval() {
        ConnectionEntity custom = prodConnection("conn-prod");
        custom.setEnv("custom");
        custom.setEnvCustom("prod-replica");
        assertTrue(service.requiresProductionApproval(2L, custom, "DELETE FROM t WHERE id = 1"));
    }

    @Test
    void requireBlocksWithoutApprovalSession() {
        ProductionWriteBlockedException ex = assertThrows(
                ProductionWriteBlockedException.class,
                () -> service.requireProductionWriteAllowed(
                        2L,
                        prodConnection("conn-prod"),
                        "UPDATE t SET a = 1",
                        null
                )
        );
        assertEquals(ProductionWriteBlockedException.CODE, ex.getMessage());
        assertEquals("conn-prod", ex.getConnectionId());
        assertEquals(2L, ex.getUserId());
    }

    @Test
    void requireBlocksForgedApprovalPrefix() {
        assertThrows(
                ProductionWriteBlockedException.class,
                () -> service.requireProductionWriteAllowed(
                        2L,
                        prodConnection("conn-prod"),
                        "UPDATE t SET a = 1",
                        ProductionWriteGuardService.APPROVAL_SESSION_PREFIX + "bypass"
                )
        );
    }

    @Test
    void requireAllowsIssuedApprovalTicketOnce() {
        String sql = "UPDATE t SET a = 1";
        ConnectionEntity connection = prodConnection("conn-prod");
        String ticket = service.issueApprovalTicket("approval-1", "conn-prod", sql);

        service.requireProductionWriteAllowed(2L, connection, sql, ticket);

        assertThrows(
                ProductionWriteBlockedException.class,
                () -> service.requireProductionWriteAllowed(2L, connection, sql, ticket)
        );
    }

    @Test
    void requireRejectsTicketForDifferentSqlOrConnection() {
        String sql = "UPDATE t SET a = 1";
        String ticket = service.issueApprovalTicket("approval-1", "conn-prod", sql);

        assertThrows(
                ProductionWriteBlockedException.class,
                () -> service.requireProductionWriteAllowed(
                        2L,
                        prodConnection("conn-prod"),
                        "DELETE FROM t",
                        ticket
                )
        );

        // Wrong SQL must not burn the ticket
        service.requireProductionWriteAllowed(2L, prodConnection("conn-prod"), sql, ticket);

        String ticket2 = service.issueApprovalTicket("approval-2", "conn-prod", sql);
        assertThrows(
                ProductionWriteBlockedException.class,
                () -> service.requireProductionWriteAllowed(
                        2L,
                        prodConnection("conn-prod-2"),
                        sql,
                        ticket2
                )
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

    private static ConnectionEntity prodConnection(String id) {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setId(id);
        entity.setName(id);
        entity.setDbType("mysql");
        entity.setEnv("prod");
        return entity;
    }
}
