package org.apache.datawise.backend.service.portability;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** Domain flags for profile export/import. */
public class ProfileDomainOptions {

    public static final String CONNECTIONS = "connections";
    public static final String APP = "app";
    public static final String SNIPPETS = "snippets";
    public static final String AI_WORKSPACE = "aiWorkspace";
    public static final String PROJECTS = "projects";
    public static final String SAVED_CONSOLES = "savedConsoles";
    public static final String SQL_HISTORY = "sqlHistory";

    private boolean connections = true;
    private boolean app = true;
    private boolean snippets = true;
    private boolean aiWorkspace = true;
    private boolean projects = true;
    private boolean savedConsoles = true;
    private boolean sqlHistory = true;
    /** App.xml sections to apply on import; empty = all known sections. */
    private List<String> appSections = new ArrayList<>();
    /** projects: preferImported | keepLocal */
    private String projectFileConflict = "preferImported";

    public static ProfileDomainOptions defaults() {
        return new ProfileDomainOptions();
    }

    public boolean isConnections() {
        return connections;
    }

    public void setConnections(boolean connections) {
        this.connections = connections;
    }

    public boolean isApp() {
        return app;
    }

    public void setApp(boolean app) {
        this.app = app;
    }

    public boolean isSnippets() {
        return snippets;
    }

    public void setSnippets(boolean snippets) {
        this.snippets = snippets;
    }

    public boolean isAiWorkspace() {
        return aiWorkspace;
    }

    public void setAiWorkspace(boolean aiWorkspace) {
        this.aiWorkspace = aiWorkspace;
    }

    public boolean isProjects() {
        return projects;
    }

    public void setProjects(boolean projects) {
        this.projects = projects;
    }

    public boolean isSavedConsoles() {
        return savedConsoles;
    }

    public void setSavedConsoles(boolean savedConsoles) {
        this.savedConsoles = savedConsoles;
    }

    public boolean isSqlHistory() {
        return sqlHistory;
    }

    public void setSqlHistory(boolean sqlHistory) {
        this.sqlHistory = sqlHistory;
    }

    public List<String> getAppSections() {
        return appSections;
    }

    public void setAppSections(List<String> appSections) {
        this.appSections = appSections != null ? appSections : new ArrayList<>();
    }

    public String getProjectFileConflict() {
        return projectFileConflict;
    }

    public void setProjectFileConflict(String projectFileConflict) {
        this.projectFileConflict = projectFileConflict != null ? projectFileConflict : "preferImported";
    }

    public List<String> enabledDomainIds() {
        List<String> ids = new ArrayList<>();
        if (connections) {
            ids.add(CONNECTIONS);
        }
        if (app) {
            ids.add(APP);
        }
        if (snippets) {
            ids.add(SNIPPETS);
        }
        if (aiWorkspace) {
            ids.add(AI_WORKSPACE);
        }
        if (projects) {
            ids.add(PROJECTS);
        }
        if (savedConsoles) {
            ids.add(SAVED_CONSOLES);
        }
        if (sqlHistory) {
            ids.add(SQL_HISTORY);
        }
        return ids;
    }

    public Set<String> appSectionFilter() {
        if (appSections == null || appSections.isEmpty()) {
            return Set.of();
        }
        return new LinkedHashSet<>(appSections);
    }
}
