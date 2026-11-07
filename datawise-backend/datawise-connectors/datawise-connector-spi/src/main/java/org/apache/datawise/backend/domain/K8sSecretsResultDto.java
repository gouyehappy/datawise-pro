package org.apache.datawise.backend.domain;

import java.util.List;

public record K8sSecretsResultDto(
        List<K8sSecretDto> secrets,
        int totalCount) {
}
