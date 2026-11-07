package org.apache.datawise.backend.service.team;

import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.TeamStore;
import org.apache.datawise.backend.configstore.FileTeamStore;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.TeamEntity;
import org.apache.datawise.backend.model.TeamMemberEntity;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.UserAccountService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TeamSupportTenantGuardTest {

    @TempDir
    Path tempDir;

    private TeamStore teamStore;
    private TeamSupport support;

    @BeforeEach
    void setUp() {
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(tempDir);
        teamStore = new FileTeamStore(configDirectory, new ObjectMapper().findAndRegisterModules());
        UserAccountService accounts = mock(UserAccountService.class);
        when(accounts.requireUserId()).thenReturn(1L);
        when(accounts.resolveUserName(1L)).thenReturn("admin");
        support = new TeamSupport(teamStore, accounts);

        TeamEntity defaultTeam = new TeamEntity();
        defaultTeam.setId("team-default");
        defaultTeam.setName("Default Team");
        defaultTeam.setOwnerUserId(1L);
        defaultTeam.setTenantId(TenantIds.DEFAULT);
        defaultTeam.setCreatedAt(Instant.now());
        teamStore.saveTeam(defaultTeam);

        TeamEntity otherTenantTeam = new TeamEntity();
        otherTenantTeam.setId("team-other");
        otherTenantTeam.setName("Other Tenant");
        otherTenantTeam.setOwnerUserId(1L);
        otherTenantTeam.setTenantId("other-org");
        otherTenantTeam.setCreatedAt(Instant.now());
        teamStore.saveTeam(otherTenantTeam);

        TeamMemberEntity member = new TeamMemberEntity();
        member.setTeamId("team-other");
        member.setUserId(1L);
        member.setRole("owner");
        member.setJoinedAt(Instant.now());
        teamStore.saveMember(member);

        UserContext.set(1L, false, "session-1", TenantIds.DEFAULT);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void requireTeam_rejectsCrossTenantTeamId() {
        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> support.requireTeam("team-other"));
        assertEquals("Team not found", ex.getMessage());
    }

    @Test
    void requireTeam_allowsSameTenantTeam() {
        TeamEntity team = support.requireTeam("team-default");
        assertEquals("team-default", team.getId());
    }

    @Test
    void requireMember_rejectsCrossTenantEvenIfMembershipExists() {
        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> support.requireMember("team-other", 1L));
        assertEquals("Team not found", ex.getMessage());
    }
}
