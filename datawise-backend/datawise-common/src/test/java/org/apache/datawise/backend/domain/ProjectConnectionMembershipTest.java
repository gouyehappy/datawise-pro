package org.apache.datawise.backend.domain;

import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ProjectConnectionMembershipTest {

    @Test
    void belongsToPrimaryOrSharedProject() {
        ConnectionEntity connection = new ConnectionEntity();
        connection.setProjectId("proj_a");
        connection.setSharedProjectIds(List.of("proj_b", "proj_c"));

        assertTrue(ProjectConnectionMembership.belongsToProject(connection, "proj_a"));
        assertTrue(ProjectConnectionMembership.belongsToProject(connection, "proj_b"));
        assertFalse(ProjectConnectionMembership.belongsToProject(connection, "proj_other"));
    }

    @Test
    void parseAndFormatSharedIds() {
        assertEquals(List.of("a", "b"), ProjectConnectionMembership.parseSharedIdsAttribute("a, b;b"));
        assertEquals("a,b", ProjectConnectionMembership.formatSharedIdsAttribute(List.of("a", "a", "b")));
        assertEquals(ProjectTemplates.ECOMMERCE, ProjectConnectionMembership.normalizeTemplateId("电商"));
        assertEquals("prod", ProjectConnectionMembership.normalizeDefaultEnv("生产"));
    }
}
