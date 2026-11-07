package org.apache.datawise.backend.database.sql;

import org.apache.datawise.backend.config.DatawiseQueryProperties;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class QueryLimitResolverTest {

    @Test
    void bothUnlimitedFallsBackToAbsoluteCeiling() {
        QueryLimitResolver resolver = resolver(0, 100_000);
        assertEquals(100_000, resolver.resolve(null));
        assertEquals(100_000, resolver.resolve(0));
    }

    @Test
    void trueUnlimitedWhenAbsoluteDisabled() {
        QueryLimitResolver resolver = resolver(0, 0);
        assertEquals(0, resolver.resolve(null));
        assertEquals(0, resolver.resolve(0));
    }

    @Test
    void clientLimitWhenServerUnlimited_stillClampedByAbsolute() {
        QueryLimitResolver resolver = resolver(0, 100_000);
        assertEquals(500, resolver.resolve(500));
        assertEquals(100_000, resolver.resolve(200_000));
    }

    @Test
    void serverDefaultWhenClientMissing() {
        QueryLimitResolver resolver = resolver(200, 100_000);
        assertEquals(200, resolver.resolve(null));
        assertEquals(200, resolver.resolve(0));
    }

    @Test
    void usesMinimumOfClientAndServer() {
        QueryLimitResolver resolver = resolver(500, 100_000);
        assertEquals(200, resolver.resolve(200));
        assertEquals(500, resolver.resolve(1000));
    }

    @Test
    void absoluteCeilingWinsOverHigherServerDefault() {
        QueryLimitResolver resolver = resolver(200_000, 50_000);
        assertEquals(50_000, resolver.resolve(null));
        assertEquals(50_000, resolver.resolve(80_000));
    }

    private static QueryLimitResolver resolver(int serverMax, int absoluteMax) {
        DatawiseQueryProperties properties = new DatawiseQueryProperties();
        properties.setMaxResultRows(serverMax);
        properties.setAbsoluteMaxResultRows(absoluteMax);
        return new QueryLimitResolver(properties);
    }
}
