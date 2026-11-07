package org.apache.datawise.backend.elasticsearch;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ElasticsearchRestClientTest {

    @Test
    void normalizePath_addsLeadingSlash() {
        assertEquals("/_cat/indices", ElasticsearchRestClient.normalizePath("_cat/indices"));
        assertEquals("/", ElasticsearchRestClient.normalizePath(""));
        assertEquals("/_search", ElasticsearchRestClient.normalizePath("/_search"));
    }
}
