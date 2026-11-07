package org.apache.datawise.backend.domain;

import java.util.List;

public record K8sDeploymentsResultDto(
        List<K8sDeploymentDto> deployments,
        int totalCount) {
}
