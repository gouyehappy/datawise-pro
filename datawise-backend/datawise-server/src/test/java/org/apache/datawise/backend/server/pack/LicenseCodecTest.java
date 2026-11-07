package org.apache.datawise.backend.server.pack;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.common.DatawiseErrorCodes;
import org.apache.datawise.backend.common.PackEntitlementException;
import org.apache.datawise.backend.domain.pack.LicenseDocument;
import org.apache.datawise.backend.domain.pack.PackIds;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LicenseCodecTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final String secret = "test-secret";

    @Test
    void issueAndVerifyRoundTrip() {
        LicenseDocument doc = new LicenseDocument(
                1,
                "site-1",
                List.of(PackIds.AI, PackIds.BACKUP),
                Instant.now().toString(),
                Instant.now().plus(30, ChronoUnit.DAYS).toString(),
                "suite.pro"
        );
        String key = LicenseCodec.issue(doc, secret, mapper);
        assertTrue(key.startsWith(LicenseCodec.PREFIX));
        LicenseDocument verified = LicenseCodec.verify(key, secret, mapper);
        assertEquals(List.of(PackIds.AI, PackIds.BACKUP), verified.packs());
        assertEquals("suite.pro", verified.suiteId());
    }

    @Test
    void rejectsTamperedSignature() {
        LicenseDocument doc = new LicenseDocument(
                1,
                "site-1",
                List.of(PackIds.AI),
                Instant.now().toString(),
                Instant.now().plus(30, ChronoUnit.DAYS).toString(),
                null
        );
        String key = LicenseCodec.issue(doc, secret, mapper);
        String tampered = key.substring(0, key.length() - 2) + "ab";
        PackEntitlementException ex = assertThrows(
                PackEntitlementException.class,
                () -> LicenseCodec.verify(tampered, secret, mapper)
        );
        assertEquals(DatawiseErrorCodes.LICENSE_MISMATCH, ex.errorCode());
    }

    @Test
    void rejectsExpiredLicense() {
        LicenseDocument doc = new LicenseDocument(
                1,
                "site-1",
                List.of(PackIds.AI),
                Instant.now().minus(10, ChronoUnit.DAYS).toString(),
                Instant.now().minus(1, ChronoUnit.DAYS).toString(),
                null
        );
        String key = LicenseCodec.issue(doc, secret, mapper);
        PackEntitlementException ex = assertThrows(
                PackEntitlementException.class,
                () -> LicenseCodec.verify(key, secret, mapper)
        );
        assertEquals(DatawiseErrorCodes.LICENSE_EXPIRED, ex.errorCode());
    }
}
