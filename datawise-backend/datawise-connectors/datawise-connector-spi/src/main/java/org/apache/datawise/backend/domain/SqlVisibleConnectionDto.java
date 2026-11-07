package org.apache.datawise.backend.domain;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Connection summary for headless CLI / automation — same visibility as the desktop
 * explorer (owned + team-shared), plus effective access level.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record SqlVisibleConnectionDto(
        String id,
        String name,
        String dbType,
        String env,
        /** {@code readonly} | {@code readwrite} | {@code ddl} */
        String access,
        /** True when the connection is shared into at least one of the user's teams. */
        boolean shared) {
}
