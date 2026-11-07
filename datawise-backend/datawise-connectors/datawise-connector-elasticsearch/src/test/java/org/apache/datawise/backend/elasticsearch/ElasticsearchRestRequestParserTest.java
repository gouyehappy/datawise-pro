package org.apache.datawise.backend.elasticsearch;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ElasticsearchRestRequestParserTest {

    @Test
    void parse_methodPathAndJsonBody() {
        ElasticsearchRestRequestParser.ParsedRequest parsed = ElasticsearchRestRequestParser.parse(
                "GET /_cat/indices\n"
        );
        assertEquals("GET", parsed.method());
        assertTrue(parsed.path().startsWith("/_cat/indices"));
        assertTrue(parsed.path().contains("format=json"));
    }

    @Test
    void parse_postSearchBody() {
        ElasticsearchRestRequestParser.ParsedRequest parsed = ElasticsearchRestRequestParser.parse("""
                POST /logs/_search
                {
                  "query": { "match_all": {} }
                }
                """);
        assertEquals("POST", parsed.method());
        assertEquals("/logs/_search", parsed.path());
        assertTrue(parsed.body().contains("match_all"));
    }

    @Test
    void parse_rejectsUnknownMethod() {
        assertThrows(IllegalArgumentException.class, () -> ElasticsearchRestRequestParser.parse("PATCH /x"));
    }

    @Test
    void parseAll_splitsMultipleRequests() {
        var requests = ElasticsearchRestRequestParser.parseAll("""
                GET /_cat/indices

                GET /_cluster/health
                """);
        assertEquals(2, requests.size());
        assertTrue(requests.get(0).path().startsWith("/_cat/indices"));
        assertEquals("/_cluster/health", requests.get(1).path());
    }
}
