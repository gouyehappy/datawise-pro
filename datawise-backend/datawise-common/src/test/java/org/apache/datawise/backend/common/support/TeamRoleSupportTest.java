package org.apache.datawise.backend.common.support;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TeamRoleSupportTest {

    @Test
    void normalizeRoleDefaultsToMember() {
        assertEquals(TeamRoleSupport.MEMBER, TeamRoleSupport.normalizeRole(null));
        assertEquals(TeamRoleSupport.MEMBER, TeamRoleSupport.normalizeRole("unknown"));
    }

    @Test
    void canManageTeamOnlyForOwnerAndAdmin() {
        assertTrue(TeamRoleSupport.canManageTeam(TeamRoleSupport.OWNER));
        assertTrue(TeamRoleSupport.canManageTeam(TeamRoleSupport.ADMIN));
        assertFalse(TeamRoleSupport.canManageTeam(TeamRoleSupport.MEMBER));
        assertFalse(TeamRoleSupport.canManageTeam(TeamRoleSupport.VIEWER));
    }

    @Test
    void onlyOwnerCanAssignRoles() {
        assertTrue(TeamRoleSupport.canAssignRole(TeamRoleSupport.OWNER));
        assertFalse(TeamRoleSupport.canAssignRole(TeamRoleSupport.ADMIN));
    }

    @Test
    void assignableRolesExcludeOwner() {
        assertTrue(TeamRoleSupport.isAssignableRole(TeamRoleSupport.ADMIN));
        assertTrue(TeamRoleSupport.isAssignableRole(TeamRoleSupport.MEMBER));
        assertTrue(TeamRoleSupport.isAssignableRole(TeamRoleSupport.VIEWER));
        assertFalse(TeamRoleSupport.isAssignableRole(TeamRoleSupport.OWNER));
    }
}
