package org.apache.datawise.backend.common;

/** JDBC URL prefix, pattern templates, and sample URL for a {@link DbType}. */
public record DbTypeUrlTemplates(String urlPrefix, String[] patterns, String sample) {

    public String[] getUrl() {
        return patterns;
    }

    public String getUrlPrefix() {
        return urlPrefix;
    }

    public String getSample() {
        return sample;
    }
}
