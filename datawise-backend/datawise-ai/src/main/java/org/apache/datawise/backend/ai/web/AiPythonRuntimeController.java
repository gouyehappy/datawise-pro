package org.apache.datawise.backend.ai.web;

import org.apache.datawise.backend.ai.config.AiPythonProperties;
import org.apache.datawise.backend.common.UnauthorizedException;
import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.common.pack.AiAccessGate;
import org.apache.datawise.backend.ai.domain.AiPythonRuntimeDto;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.UserAccessPolicy;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/ai/python")
public class AiPythonRuntimeController {

    private final AiPythonProperties pythonProperties;
    private final UserAccessPolicy userAccessPolicy;
    private final AiAccessGate aiAccessGate;

    public AiPythonRuntimeController(
            AiPythonProperties pythonProperties,
            UserAccessPolicy userAccessPolicy,
            AiAccessGate aiAccessGate
    ) {
        this.pythonProperties = pythonProperties;
        this.userAccessPolicy = userAccessPolicy;
        this.aiAccessGate = aiAccessGate;
    }

    @GetMapping("/runtime")
    public ApiResponse<AiPythonRuntimeDto> runtime() {
        if (UserContext.getUserId() == null) {
            throw new UnauthorizedException();
        }
        userAccessPolicy.requireRegisteredUser();
        aiAccessGate.requireAiPack();
        return ApiResponse.ok(new AiPythonRuntimeDto(
                pythonProperties.isEnabled(),
                pythonProperties.getExecutor(),
                pythonProperties.isSandboxEnabled(),
                pythonProperties.isDependencyInstallEnabled(),
                pythonProperties.getDockerImage(),
                pythonProperties.getK8sNamespace(),
                pythonProperties.getTimeoutSeconds(),
                pythonProperties.getDependencyInstallTimeoutSeconds(),
                pythonProperties.getMaxRetries()
        ));
    }
}
