package org.apache.datawise.backend.service.portability;

import java.util.ArrayList;
import java.util.List;

public class ProfileExportRequest {

    private String passphrase;
    private String confirmPassphrase;
    private ProfileDomainOptions domains = ProfileDomainOptions.defaults();
    /** When non-empty, only these connection ids are included in the connections domain. */
    private List<String> connectionIds = new ArrayList<>();
    /**
     * When set (and {@link #connectionIds} empty), export all connections belonging to this project
     * (owned or shared into it).
     */
    private String projectId;

    public String getPassphrase() {
        return passphrase;
    }

    public void setPassphrase(String passphrase) {
        this.passphrase = passphrase;
    }

    public String getConfirmPassphrase() {
        return confirmPassphrase;
    }

    public void setConfirmPassphrase(String confirmPassphrase) {
        this.confirmPassphrase = confirmPassphrase;
    }

    public ProfileDomainOptions getDomains() {
        return domains != null ? domains : ProfileDomainOptions.defaults();
    }

    public void setDomains(ProfileDomainOptions domains) {
        this.domains = domains;
    }

    public List<String> getConnectionIds() {
        return connectionIds != null ? connectionIds : List.of();
    }

    public void setConnectionIds(List<String> connectionIds) {
        this.connectionIds = connectionIds != null ? new ArrayList<>(connectionIds) : new ArrayList<>();
    }

    public String getProjectId() {
        return projectId;
    }

    public void setProjectId(String projectId) {
        this.projectId = projectId;
    }
}
