package org.apache.datawise.backend.common;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class DbTypeProfilesTest {

    @Test
    void mysqlProfileLoadsExpectedDriverAndPort() {
        DbTypeProfile profile = DbTypeProfiles.load().get(DbType.MYSQL);
        assertNotNull(profile);
        assertEquals("com.mysql.cj.jdbc.Driver", profile.driver());
        assertEquals(3306, profile.port());
        assertEquals("MySQL", profile.displayName());
        assertEquals("`", profile.quote());
    }
}
