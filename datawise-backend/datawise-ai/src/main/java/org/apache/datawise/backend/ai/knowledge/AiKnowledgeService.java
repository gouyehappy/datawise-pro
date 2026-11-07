package org.apache.datawise.backend.ai.knowledge;

import org.apache.datawise.backend.configstore.AiKnowledgeStore;
import org.apache.datawise.backend.model.AiKnowledgeEntry;
import org.apache.datawise.backend.service.UserResource;
import org.apache.datawise.backend.service.UserResourcePolicy;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class AiKnowledgeService {

    private final AiKnowledgeStore knowledgeStore;
    private final UserResourcePolicy resourcePolicy;

    public AiKnowledgeService(AiKnowledgeStore knowledgeStore, UserResourcePolicy resourcePolicy) {
        this.knowledgeStore = knowledgeStore;
        this.resourcePolicy = resourcePolicy;
    }

    public List<AiKnowledgeEntry> list(String connectionId, String database) {
        if ((connectionId != null && !connectionId.isBlank()) || (database != null && !database.isBlank())) {
            return knowledgeStore.listScoped(connectionId, database);
        }
        return knowledgeStore.listAll();
    }

    public List<AiKnowledgeEntry> replaceAll(List<AiKnowledgeEntry> entries) {
        resourcePolicy.requireWrite(UserResource.AI_KNOWLEDGE);
        knowledgeStore.replaceAll(entries != null ? entries : List.of());
        return knowledgeStore.listAll();
    }
}
