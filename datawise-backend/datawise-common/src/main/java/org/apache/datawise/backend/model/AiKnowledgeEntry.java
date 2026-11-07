package org.apache.datawise.backend.model;

import java.util.ArrayList;
import java.util.List;

/**
 * 连接/库级业务词条（configstore `ai-knowledge.json`）
 */
public class AiKnowledgeEntry {

    private String id;
    private String connectionId;
    private String database;
    private String term;
    private String definition;
    private List<String> synonyms = new ArrayList<>();
    private List<String> relatedTables = new ArrayList<>();

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getConnectionId() {
        return connectionId;
    }

    public void setConnectionId(String connectionId) {
        this.connectionId = connectionId;
    }

    public String getDatabase() {
        return database;
    }

    public void setDatabase(String database) {
        this.database = database;
    }

    public String getTerm() {
        return term;
    }

    public void setTerm(String term) {
        this.term = term;
    }

    public String getDefinition() {
        return definition;
    }

    public void setDefinition(String definition) {
        this.definition = definition;
    }

    public List<String> getSynonyms() {
        return synonyms;
    }

    public void setSynonyms(List<String> synonyms) {
        this.synonyms = synonyms != null ? new ArrayList<>(synonyms) : new ArrayList<>();
    }

    public List<String> getRelatedTables() {
        return relatedTables;
    }

    public void setRelatedTables(List<String> relatedTables) {
        this.relatedTables = relatedTables != null ? new ArrayList<>(relatedTables) : new ArrayList<>();
    }
}
