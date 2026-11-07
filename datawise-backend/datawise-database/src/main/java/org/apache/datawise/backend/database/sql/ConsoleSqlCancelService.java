package org.apache.datawise.backend.database.sql;

import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.service.UserAccountService;
import org.apache.datawise.backend.domain.CancelSqlExecutionRequest;
import org.apache.datawise.backend.domain.CancelSqlExecutionResult;
import org.springframework.stereotype.Service;

import static org.apache.datawise.backend.ops.spi.SessionKillOps.normalizeMode;

@Service
public class ConsoleSqlCancelService {

    private final UserAccountService userAccountService;
    private final ConnectorFacade connectorFacade;

    public ConsoleSqlCancelService(
            UserAccountService userAccountService,
            ConnectorFacade connectorFacade
    ) {
        this.userAccountService = userAccountService;
        this.connectorFacade = connectorFacade;
    }

    public CancelSqlExecutionResult cancel(CancelSqlExecutionRequest request) {
        if (request.sessionKey() == null || request.sessionKey().isBlank()) {
            throw new IllegalArgumentException("sessionKey is required");
        }
        long userId = userAccountService.requireUserId();
        String mode = normalizeMode(request.mode());
        String executionKey = executionKey(userId, request.sessionKey());

        var outcome = "connection".equals(mode)
                ? connectorFacade.jdbc().session().cancelConnection(executionKey)
                : connectorFacade.jdbc().session().cancelQuery(executionKey);

        return new CancelSqlExecutionResult(outcome.cancelled(), mode, outcome.message());
    }

    static String executionKey(long userId, String sessionKey) {
        return userId + ":" + sessionKey.trim();
    }
}
