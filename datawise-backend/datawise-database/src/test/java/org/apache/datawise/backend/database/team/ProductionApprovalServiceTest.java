package org.apache.datawise.backend.database.team;

import org.apache.datawise.backend.database.sql.SqlExecuteService;
import org.apache.datawise.backend.domain.ExecuteSqlRequest;
import org.apache.datawise.backend.domain.TeamProductionApprovalDetailDto;
import org.apache.datawise.backend.model.TeamProductionApprovalEntity;
import org.apache.datawise.backend.service.ProductionWriteGuardService;
import org.apache.datawise.backend.service.TeamService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ProductionApprovalServiceTest {

    @Mock
    private TeamService teamService;

    @Mock
    private SqlExecuteService sqlExecuteService;

    @Mock
    private ProductionWriteGuardService productionWriteGuardService;

    @InjectMocks
    private ProductionApprovalService productionApprovalService;

    @Test
    void approveAndExecute_runsSqlAndFinalizesSuccess() {
        TeamProductionApprovalEntity pending = pendingApproval();
        TeamProductionApprovalDetailDto approved = detail("approved");

        when(teamService.claimPendingProductionApprovalForExecution("team-1", "apr-1")).thenReturn(pending);
        when(teamService.requireAuthenticatedUserId()).thenReturn(42L);
        when(productionWriteGuardService.issueApprovalTicket("apr-1", "conn-prod", "UPDATE t SET x=1"))
                .thenReturn("prod-approval-issued-ticket");
        when(teamService.finalizeProductionApproval("team-1", "apr-1", 42L, true, null)).thenReturn(approved);

        TeamProductionApprovalDetailDto result = productionApprovalService.approveAndExecute("team-1", "apr-1");

        assertEquals(approved, result);

        ArgumentCaptor<ExecuteSqlRequest> requestCaptor = ArgumentCaptor.forClass(ExecuteSqlRequest.class);
        verify(sqlExecuteService).execute(requestCaptor.capture());
        ExecuteSqlRequest request = requestCaptor.getValue();
        assertEquals("UPDATE t SET x=1", request.sql());
        assertEquals("conn-prod", request.connectionId());
        assertEquals("app", request.database());
        assertEquals("prod-approval-issued-ticket", request.sessionKey());
    }

    @Test
    void approveAndExecute_sqlFailureFinalizesWithErrorMessage() {
        TeamProductionApprovalEntity pending = pendingApproval();
        TeamProductionApprovalDetailDto failed = detail("failed");

        when(teamService.claimPendingProductionApprovalForExecution("team-1", "apr-1")).thenReturn(pending);
        when(teamService.requireAuthenticatedUserId()).thenReturn(42L);
        when(productionWriteGuardService.issueApprovalTicket(any(), any(), any()))
                .thenReturn("prod-approval-issued-ticket");
        when(sqlExecuteService.execute(any())).thenThrow(new RuntimeException("syntax error"));
        when(teamService.finalizeProductionApproval("team-1", "apr-1", 42L, false, "syntax error"))
                .thenReturn(failed);

        TeamProductionApprovalDetailDto result = productionApprovalService.approveAndExecute("team-1", "apr-1");

        assertEquals(failed, result);
        verify(teamService).finalizeProductionApproval(eq("team-1"), eq("apr-1"), eq(42L), eq(false), eq("syntax error"));
    }

    @Test
    void approveAndExecute_sqlFailureUsesExceptionClassWhenMessageMissing() {
        TeamProductionApprovalEntity pending = pendingApproval();
        TeamProductionApprovalDetailDto failed = detail("failed");

        when(teamService.claimPendingProductionApprovalForExecution("team-1", "apr-1")).thenReturn(pending);
        when(teamService.requireAuthenticatedUserId()).thenReturn(42L);
        when(productionWriteGuardService.issueApprovalTicket(any(), any(), any()))
                .thenReturn("prod-approval-issued-ticket");
        when(sqlExecuteService.execute(any())).thenThrow(new RuntimeException());
        when(teamService.finalizeProductionApproval("team-1", "apr-1", 42L, false, "RuntimeException"))
                .thenReturn(failed);

        TeamProductionApprovalDetailDto result = productionApprovalService.approveAndExecute("team-1", "apr-1");

        assertEquals(failed, result);
    }

    @Test
    void approveAndExecute_dataMigrationPlanSkipsSqlExecution() {
        TeamProductionApprovalEntity pending = pendingApproval();
        pending.setSql(
                "/* " + ProductionApprovalService.DATA_MIGRATION_APPROVAL_MARKER + " */\n"
                        + "INSERT INTO __datawise_data_migration_plan__(note) VALUES ('review-only');"
        );
        TeamProductionApprovalDetailDto approved = detail("executed");

        when(teamService.claimPendingProductionApprovalForExecution("team-1", "apr-1")).thenReturn(pending);
        when(teamService.requireAuthenticatedUserId()).thenReturn(42L);
        when(teamService.finalizeProductionApproval("team-1", "apr-1", 42L, true, null)).thenReturn(approved);

        TeamProductionApprovalDetailDto result = productionApprovalService.approveAndExecute("team-1", "apr-1");

        assertEquals(approved, result);
        verify(sqlExecuteService, never()).execute(any());
        verify(productionWriteGuardService, never()).issueApprovalTicket(any(), any(), any());
        verify(teamService).finalizeProductionApproval(eq("team-1"), eq("apr-1"), eq(42L), eq(true), eq(null));
    }

    private static TeamProductionApprovalEntity pendingApproval() {
        TeamProductionApprovalEntity pending = new TeamProductionApprovalEntity();
        pending.setId("apr-1");
        pending.setSql("UPDATE t SET x=1");
        pending.setConnectionId("conn-prod");
        pending.setDatabase("app");
        return pending;
    }

    private static TeamProductionApprovalDetailDto detail(String status) {
        return new TeamProductionApprovalDetailDto(
                "apr-1",
                "team-1",
                "conn-prod",
                "Prod",
                "app",
                "UPDATE t SET x=1",
                status,
                "alice",
                2L,
                "owner",
                42L,
                null,
                status.equals("failed") ? "syntax error" : null,
                "2026-06-27T00:00:00Z",
                "2026-06-27T00:01:00Z"
        );
    }
}
