package org.apache.datawise.backend.service.portability;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class ProfileImportResult {

    private boolean success;
    private List<String> appliedDomains = new ArrayList<>();
    private List<String> warnings = new ArrayList<>();
    private Map<String, Object> counts = new LinkedHashMap<>();
    private boolean restartRecommended;

    public boolean isSuccess() {
        return success;
    }

    public void setSuccess(boolean success) {
        this.success = success;
    }

    public List<String> getAppliedDomains() {
        return appliedDomains;
    }

    public void setAppliedDomains(List<String> appliedDomains) {
        this.appliedDomains = appliedDomains != null ? appliedDomains : new ArrayList<>();
    }

    public List<String> getWarnings() {
        return warnings;
    }

    public void setWarnings(List<String> warnings) {
        this.warnings = warnings != null ? warnings : new ArrayList<>();
    }

    public Map<String, Object> getCounts() {
        return counts;
    }

    public void setCounts(Map<String, Object> counts) {
        this.counts = counts != null ? counts : new LinkedHashMap<>();
    }

    public boolean isRestartRecommended() {
        return restartRecommended;
    }

    public void setRestartRecommended(boolean restartRecommended) {
        this.restartRecommended = restartRecommended;
    }
}
