package org.apache.datawise.backend.server.communityplugin;

import org.apache.datawise.backend.domain.communityplugin.CommunityPluginException;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CommunityPluginPackageFetcherTest {

    @Test
    void rejectsNonHttpUrls() {
        assertThrows(CommunityPluginException.class, () -> CommunityPluginPackageFetcher.requireHttpUrl("file:///tmp/plugin.dwp"));
        assertThrows(CommunityPluginException.class, () -> CommunityPluginPackageFetcher.requireHttpUrl("https://user:pass@example.com/a.dwp"));
        assertThrows(CommunityPluginException.class, () -> CommunityPluginPackageFetcher.requireHttpUrl(""));
    }

    @Test
    void rejectsPlainHttpAndPrivateHosts() {
        assertThrows(CommunityPluginException.class,
                () -> CommunityPluginPackageFetcher.requireHttpUrl("http://example.com/a.dwp"));
        assertThrows(CommunityPluginException.class,
                () -> CommunityPluginPackageFetcher.requireHttpUrl("https://169.254.169.254/latest/meta-data"));
        assertThrows(CommunityPluginException.class,
                () -> CommunityPluginPackageFetcher.requireHttpUrl("https://10.0.0.5/plugin.dwp"));
    }

    @Test
    void allowsHttpsPublicAndLoopbackHttp() {
        assertTrue(CommunityPluginPackageFetcher.requireHttpUrl("https://cdn.example.com/a.dwp")
                .getHost().equals("cdn.example.com"));
        assertTrue(CommunityPluginPackageFetcher.requireHttpUrl("http://127.0.0.1:8080/a.dwp")
                .getHost().equals("127.0.0.1"));
    }

    @Test
    void fetchesClasspathFixtureWhenPresent() {
        org.junit.jupiter.api.Assumptions.assumeTrue(
                new org.springframework.core.io.ClassPathResource(
                        "community-plugin-fixtures/io.datawise.example.hello-1.0.0.dwp").exists());
        byte[] bytes = CommunityPluginPackageFetcher.fetch(
                "classpath:community-plugin-fixtures/io.datawise.example.hello-1.0.0.dwp");
        assertTrue(bytes.length > 100);
    }
}
