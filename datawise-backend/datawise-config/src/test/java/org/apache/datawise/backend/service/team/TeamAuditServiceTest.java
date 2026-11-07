package org.apache.datawise.backend.service.team;

import org.apache.datawise.backend.service.UserAccountService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@ExtendWith(MockitoExtension.class)
class TeamAuditServiceTest {

    @TempDir
    Path tempDir;

    @Mock
    private UserAccountService userAccountService;

    @Test
    void recordTerminalAudit_writesToAllUserTeams() {
        TeamServiceTestFixtures.stubUser(userAccountService, 5L, "operator");
        var ctx = TeamServiceTestFixtures.newContext(tempDir, userAccountService);
        String teamA = TeamServiceTestFixtures.uniqueTeamId();
        String teamB = TeamServiceTestFixtures.uniqueTeamId();
        TeamServiceTestFixtures.seedTeam(ctx.teamStore(), teamA, "Team A", 1L);
        TeamServiceTestFixtures.seedTeam(ctx.teamStore(), teamB, "Team B", 2L);
        TeamServiceTestFixtures.seedMember(ctx.teamStore(), teamA, 5L, "member");
        TeamServiceTestFixtures.seedMember(ctx.teamStore(), teamB, 5L, "member");

        ctx.auditService().recordTerminalAudit(5L, "terminal.pty.open", "sessionId=s-1");

        var logsA = ctx.teamStore().findAuditLogsByTeamId(teamA, 10, null, null, null);
        var logsB = ctx.teamStore().findAuditLogsByTeamId(teamB, 10, null, null, null);
        assertEquals(1, logsA.size());
        assertEquals(1, logsB.size());
        assertEquals("terminal.pty.open", logsA.get(0).getAction());
        assertTrue(logsA.get(0).getDetail().contains("sessionId=s-1"));
        assertEquals("default", logsA.get(0).getTenantId());
        assertEquals("default", logsB.get(0).getTenantId());
    }

    @Test
    void recordSqlExecutionAudit_skipsBlankSql() {
        TeamServiceTestFixtures.stubUser(userAccountService, 1L, "owner");
        var ctx = TeamServiceTestFixtures.newContext(tempDir, userAccountService);
        String teamId = TeamServiceTestFixtures.uniqueTeamId();
        TeamServiceTestFixtures.seedTeam(ctx.teamStore(), teamId, "Ops", 1L);
        TeamServiceTestFixtures.seedMember(ctx.teamStore(), teamId, 1L, "owner");

        ctx.auditService().recordSqlExecutionAudit("sql.execute", "conn-1", "db", "   ");

        assertTrue(ctx.teamStore().findAuditLogsByTeamId(teamId, 10, null, null, null).isEmpty());
    }
}
