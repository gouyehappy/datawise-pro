package org.apache.datawise.backend.service.portability;

public class ProfileImportOptions {

    private ProfileDomainOptions domains = ProfileDomainOptions.defaults();

    public ProfileDomainOptions getDomains() {
        return domains != null ? domains : ProfileDomainOptions.defaults();
    }

    public void setDomains(ProfileDomainOptions domains) {
        this.domains = domains;
    }
}
