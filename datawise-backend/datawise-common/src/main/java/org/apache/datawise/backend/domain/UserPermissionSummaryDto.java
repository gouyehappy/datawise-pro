package org.apache.datawise.backend.domain;

import java.util.List;
import java.util.Map;

public record UserPermissionSummaryDto(
        Long id,
        String username,
        String displayName,
        boolean guest,
        boolean admin,
        Map<String, Boolean> featurePermissions,
        List<String> roleIds,
        List<String> roleKeys,
        boolean usesLegacyPermissions) {

    public UserPermissionSummaryDto(
                                    Long id,
                                    String username,
                                    String displayName,
                                    boolean guest,
                                    boolean admin,
                                    Map<String, Boolean> featurePermissions) {
        this(id, username, displayName, guest, admin, featurePermissions, List.of(), List.of(), false);
    }
}
