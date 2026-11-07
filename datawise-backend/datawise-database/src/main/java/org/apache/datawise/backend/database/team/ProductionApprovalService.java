package org.apache.datawise.backend.database.team;

import org.apache.datawise.backend.database.sql.SqlExecuteService;
import org.apache.datawise.backend.domain.ExecuteSqlRequest;
import org.apache.datawise.backend.domain.TeamProductionApprovalDetailDto;
import org.apache.datawise.backend.model.TeamProductionApprovalEntity;
import org.apache.datawise.backend.service.ProductionWriteGuardService;
import org.apache.datawise.backend.service.TeamService;
import org.springframework.stereotype.Service;

@Service
public class ProductionApprovalService {

    /** Frontend embeds this marker in data-migration approval plans (not executable SQL). */
    public static final String DATA_MIGRATION_APPROVAL_MARKER = "DATAWISE_APPROVAL_KIND:DATA_MIGRATION";

    private final TeamService teamService;
    private final SqlExecuteService sqlExecuteService;
    private final ProductionWriteGuardService productionWriteGuardService;

    public ProductionApprovalService(
            TeamService teamService,
            SqlExecuteService sqlExecuteService,
            ProductionWriteGuardService productionWriteGuardService
    ) {
        this.teamService = teamService;
        this.sqlExecuteService = sqlExecuteService;
        this.productionWriteGuardService = productionWriteGuardService;
    }

    public TeamProductionApprovalDetailDto approveAndExecute(String teamId, String approvalId) {
        TeamProductionApprovalEntity pending = teamService.claimPendingProductionApprovalForExecution(teamId, approvalId);
        Long reviewerId = teamService.requireAuthenticatedUserId();
        if (isDataMigrationPlan(pending.getSql())) {
            return teamService.finalizeProductionApproval(teamId, approvalId, reviewerId, true, null);
        }
        String ticket = productionWriteGuardService.issueApprovalTicket(
                pending.getId(),
                pending.getConnectionId(),
                pending.getSql()
        );
        try {
            sqlExecuteService.execute(new ExecuteSqlRequest(
                    pending.getSql(),
                    pending.getConnectionId(),
                    pending.getDatabase(),
                    null,
                    ticket,
                    null,
                    null,
                    null
            ));
            return teamService.finalizeProductionApproval(teamId, approvalId, reviewerId, true, null);
        } catch (Exception ex) {
            String message = ex.getMessage() != null ? ex.getMessage() : ex.getClass().getSimpleName();
            return teamService.finalizeProductionApproval(teamId, approvalId, reviewerId, false, message);
        }
    }

    static boolean isDataMigrationPlan(String sql) {
        return sql != null && sql.contains(DATA_MIGRATION_APPROVAL_MARKER);
    }
}
