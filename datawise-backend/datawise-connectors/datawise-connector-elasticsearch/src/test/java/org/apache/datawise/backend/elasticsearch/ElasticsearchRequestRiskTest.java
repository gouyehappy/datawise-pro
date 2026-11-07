package org.apache.datawise.backend.elasticsearch;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ElasticsearchRequestRiskTest {

    @Test
    void classifiesReadWriteDangerous() {
        assertEquals(ElasticsearchRequestRisk.Level.READ, ElasticsearchRequestRisk.classify("GET", "/_cat/indices"));
        assertEquals(ElasticsearchRequestRisk.Level.READ, ElasticsearchRequestRisk.classify("POST", "/logs/_search"));
        assertEquals(ElasticsearchRequestRisk.Level.WRITE, ElasticsearchRequestRisk.classify("POST", "/logs/_doc"));
        assertEquals(
                ElasticsearchRequestRisk.Level.DANGEROUS,
                ElasticsearchRequestRisk.classify("POST", "/logs/_delete_by_query")
        );
        assertEquals(
                ElasticsearchRequestRisk.Level.WRITE,
                ElasticsearchRequestRisk.classify("DELETE", "/logs/_doc/1")
        );
    }
}
