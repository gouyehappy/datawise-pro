package org.apache.datawise.backend.service.portability;

public class ProfileConflictItem {

    private String domain;
    private String id;
    private String name;
    private String action;

    public ProfileConflictItem() {
    }

    public ProfileConflictItem(String domain, String id, String name, String action) {
        this.domain = domain;
        this.id = id;
        this.name = name;
        this.action = action;
    }

    public String getDomain() {
        return domain;
    }

    public void setDomain(String domain) {
        this.domain = domain;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getAction() {
        return action;
    }

    public void setAction(String action) {
        this.action = action;
    }
}
