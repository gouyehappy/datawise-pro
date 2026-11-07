package org.apache.datawise.backend.configstore.jdbc;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.TeamEntity;
import org.apache.datawise.backend.model.TeamMemberEntity;
import org.apache.datawise.backend.security.UserContext;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JdbcTeamStoreTest {

    private HikariDataSource dataSource;
    private JdbcTeamStore teamStore;

    @BeforeEach
    void setUp() {
        HikariConfig hikari = new HikariConfig();
        hikari.setJdbcUrl("jdbc:h2:mem:jdbc_team_test_" + System.nanoTime() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1");
        hikari.setUsername("sa");
        hikari.setPassword("");
        dataSource = new HikariDataSource(hikari);
        Flyway.configure()
                .dataSource(dataSource)
                .locations("classpath:db/metadata/migration")
                .load()
                .migrate();
        teamStore = new JdbcTeamStore(new JdbcTemplate(dataSource), new ObjectMapper().findAndRegisterModules());
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
        if (dataSource != null) {
            dataSource.close();
        }
    }

    @Test
    void teamsAreIsolatedByTenant() {
        UserContext.set(1L, false, "s1", TenantIds.DEFAULT);
        TeamEntity defaultTeam = new TeamEntity();
        defaultTeam.setId("t-default");
        defaultTeam.setName("Default");
        defaultTeam.setTenantId(TenantIds.DEFAULT);
        defaultTeam.setOwnerUserId(1L);
        defaultTeam.setCreatedAt(Instant.now());
        teamStore.saveTeam(defaultTeam);

        UserContext.set(1L, false, "s1", "acme");
        teamStore.ensureTenantFiles("acme");
        TeamEntity acmeTeam = new TeamEntity();
        acmeTeam.setId("t-acme");
        acmeTeam.setName("Acme");
        acmeTeam.setTenantId("acme");
        acmeTeam.setOwnerUserId(1L);
        acmeTeam.setCreatedAt(Instant.now());
        teamStore.saveTeam(acmeTeam);
        TeamMemberEntity member = new TeamMemberEntity();
        member.setTeamId("t-acme");
        member.setUserId(1L);
        member.setRole("owner");
        teamStore.saveMember(member);

        assertEquals(1, teamStore.listAllTeams().size());
        assertEquals("t-acme", teamStore.listAllTeams().get(0).getId());
        assertEquals(1, teamStore.findMembersByTeamId("t-acme").size());

        UserContext.set(1L, false, "s1", TenantIds.DEFAULT);
        assertEquals(1, teamStore.listAllTeams().size());
        assertEquals("t-default", teamStore.listAllTeams().get(0).getId());
        assertTrue(teamStore.findMembersByTeamId("t-acme").isEmpty());
    }
}
