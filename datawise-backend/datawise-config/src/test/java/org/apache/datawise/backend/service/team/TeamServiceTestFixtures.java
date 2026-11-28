package org.apache.datawise.backend.service.team;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.ConnectionStore;
import org.apache.datawise.backend.configstore.FileProjectStore;
import org.apache.datawise.backend.configstore.TeamStore;
import org.apache.datawise.backend.configstore.FileTeamStore;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.TeamEntity;
import org.apache.datawise.backend.model.TeamMemberEntity;
import org.apache.datawise.backend.service.UserAccountService;

import org.apache.datawise.backend.service.outbound.OutboundNotifySupport;

import java.nio.file.Path;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;

final class TeamServiceTestFixtures {

    private TeamServiceTestFixtures() {
    }

    static TeamContext newContext(Path tempDir, UserAccountService userAccountService) {
        ObjectMapper objectMapper = testObjectMapper();
        TeamStore teamStore = new FileTeamStore(new ConfigDirectoryService(tempDir), objectMapper);
        TeamSupport support = new TeamSupport(teamStore, userAccountService);
        OutboundNotifySupport outboundNotifySupport = mock(OutboundNotifySupport.class);
        TeamAuditService auditService = new TeamAuditService(teamStore, support, outboundNotifySupport);
        TeamSharedQueryStreamHub streamHub = new TeamSharedQueryStreamHub();
        InMemoryConnectionStore connectionStore = new InMemoryConnectionStore();
        return new TeamContext(
                teamStore,
                support,
                auditService,
                new TeamMembershipService(support, auditService, outboundNotifySupport),
                new TeamSharingService(support, auditService, objectMapper, new FileProjectStore(
                        new ConfigDirectoryService(tempDir), objectMapper), connectionStore),
                new TeamSharedQueryService(support, auditService, streamHub),
                new TeamProductionApprovalService(support, auditService, outboundNotifySupport),
                connectionStore);
    }

    static ConnectionEntity seedOwnedConnection(InMemoryConnectionStore store, String id, long userId) {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setId(id);
        entity.setUserId(userId);
        entity.setName(id);
        entity.setDbType("mysql");
        store.put(entity);
        return entity;
    }

    static void stubUser(UserAccountService userAccountService, long userId, String displayName) {
        lenient().when(userAccountService.requireUserId()).thenReturn(userId);
        lenient().when(userAccountService.resolveUserName(userId)).thenReturn(displayName);
    }

    static TeamEntity seedTeam(TeamStore teamStore, String teamId, String name, long ownerUserId) {
        TeamEntity team = new TeamEntity();
        team.setId(teamId);
        team.setName(name);
        team.setOwnerUserId(ownerUserId);
        team.setInviteCode("invite01");
        team.setRequireInviteApproval(false);
        team.setCreatedAt(Instant.now());
        teamStore.saveTeam(team);
        return team;
    }

    static TeamMemberEntity seedMember(
                                       TeamStore teamStore,
                                       String teamId,
                                       long userId,
                                       String role) {
        TeamMemberEntity member = new TeamMemberEntity();
        member.setTeamId(teamId);
        member.setUserId(userId);
        member.setRole(role);
        member.setJoinedAt(Instant.now());
        teamStore.saveMember(member);
        return member;
    }

    static String uniqueTeamId() {
        return "team-" + UUID.randomUUID().toString().substring(0, 8);
    }

    private static ObjectMapper testObjectMapper() {
        return new ObjectMapper().registerModule(new JavaTimeModule());
    }

    record TeamContext(
            TeamStore teamStore,
            TeamSupport support,
            TeamAuditService auditService,
            TeamMembershipService membership,
            TeamSharingService sharing,
            TeamSharedQueryService sharedQuery,
            TeamProductionApprovalService productionApproval,
            InMemoryConnectionStore connectionStore) {
    }

    /** Minimal ConnectionStore for share-validation unit tests. */
    static final class InMemoryConnectionStore implements ConnectionStore {
        private final ConcurrentHashMap<String, ConnectionEntity> byId = new ConcurrentHashMap<>();

        void put(ConnectionEntity entity) {
            byId.put(entity.getId(), entity);
        }

        @Override
        public void ensureTenantFiles(String tenantId) {
        }

        @Override
        public java.nio.file.Path connectionsFilePath() {
            return java.nio.file.Path.of("connections-test.xml");
        }

        @Override
        public String readConnectionsXml() {
            return "";
        }

        @Override
        public java.util.List<org.apache.datawise.backend.model.ConnectionGroupEntity> findAllGroups() {
            return java.util.List.of();
        }

        @Override
        public java.util.List<ConnectionEntity> findAllConnections() {
            return java.util.List.copyOf(byId.values());
        }

        @Override
        public java.util.List<org.apache.datawise.backend.model.ConnectionGroupEntity> findRootGroups() {
            return java.util.List.of();
        }

        @Override
        public java.util.List<org.apache.datawise.backend.model.ConnectionGroupEntity> findChildGroups(String parentId) {
            return java.util.List.of();
        }

        @Override
        public void replaceAll(
                java.util.List<org.apache.datawise.backend.model.ConnectionGroupEntity> groups,
                java.util.List<ConnectionEntity> connections) {
        }

        @Override
        public void importConnectionsXml(String xml) {
        }

        @Override
        public Optional<org.apache.datawise.backend.model.ConnectionGroupEntity> findGroupById(String groupId) {
            return Optional.empty();
        }

        @Override
        public org.apache.datawise.backend.model.ConnectionGroupEntity saveGroup(
                org.apache.datawise.backend.model.ConnectionGroupEntity group) {
            return group;
        }

        @Override
        public void deleteGroupById(String groupId) {
        }

        @Override
        public Optional<ConnectionEntity> findConnectionById(String connectionId) {
            return Optional.ofNullable(byId.get(connectionId));
        }

        @Override
        public java.util.List<ConnectionEntity> findConnectionsByGroupId(String groupId) {
            return java.util.List.of();
        }

        @Override
        public ConnectionEntity saveConnection(ConnectionEntity connection) {
            put(connection);
            return connection;
        }

        @Override
        public void deleteConnectionById(String connectionId) {
            byId.remove(connectionId);
        }

        @Override
        public int migratePlaintextSecretsIfNeeded() {
            return 0;
        }
    }
}
