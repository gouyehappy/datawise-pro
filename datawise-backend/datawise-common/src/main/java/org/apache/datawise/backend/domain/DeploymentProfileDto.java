package org.apache.datawise.backend.domain;

import java.util.List;

/**
 * Instance deployment posture vs team-server recommendations ({@code docs/DEPLOYMENT.md}).
 */
public record DeploymentProfileDto(
        List<String> activeProfiles,
        String mode,
        List<DeploymentCheckDto> checks,
        int okCount,
        int warnCount,
        int infoCount,
        boolean pythonSimulated) {

    public record DeploymentCheckDto(
            String id,
            String currentValue,
            String recommendedValue,
            String status,
            String docsHint) {
    }
}
