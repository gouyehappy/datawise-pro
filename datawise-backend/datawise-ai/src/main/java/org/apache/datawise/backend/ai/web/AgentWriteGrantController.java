package org.apache.datawise.backend.ai.web;

import org.apache.datawise.backend.ai.service.AgentWriteGrantService;
import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.security.UserContext;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/ai/agent/write-grants")
public class AgentWriteGrantController {

    private final AgentWriteGrantService agentWriteGrantService;

    public AgentWriteGrantController(AgentWriteGrantService agentWriteGrantService) {
        this.agentWriteGrantService = agentWriteGrantService;
    }

    @PostMapping
    public ApiResponse<AgentWriteGrantService.GrantView> issue(@RequestBody IssueBody body) {
        try {
            return ApiResponse.ok(agentWriteGrantService.issue(new AgentWriteGrantService.IssueRequest(
                    body.conversationId(),
                    body.connectionId(),
                    body.database(),
                    body.schema(),
                    body.confirmedSql())));
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ex.getMessage());
        }
    }

    public record IssueBody(
            String conversationId,
            String connectionId,
            String database,
            String schema,
            String confirmedSql) {
    }
}
