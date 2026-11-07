package org.apache.datawise.backend.domain;

import java.util.List;

public record TableMigrationPreflightResult(
        int readyCount,
        int warnCount,
        int blockedCount,
        boolean canProceed,
        List<TableMigrationPreflightTableResult> tables) {
}
