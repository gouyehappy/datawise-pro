package org.apache.datawise.backend.domain;

import java.util.Map;

public record UpdateUserPermissionsRequest(
        Map<String, Boolean> featurePermissions) {
}
