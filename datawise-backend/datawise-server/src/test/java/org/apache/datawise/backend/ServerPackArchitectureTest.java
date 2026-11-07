package org.apache.datawise.backend;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

/**
 * Core HTTP entrypoint packages (in datawise-server) must not depend on paid optional module types.
 * Note: datawise-backup still uses {@code controller.backup} / {@code server.backup} package names;
 * those subjects are excluded from the backup rule (they live in the optional jar).
 */
@AnalyzeClasses(
        packages = {
                "org.apache.datawise.backend.controller",
                "org.apache.datawise.backend.platform",
                "org.apache.datawise.backend.server"
        },
        importOptions = ImportOption.DoNotIncludeTests.class
)
class ServerPackArchitectureTest {

    private static final String[] CORE_PACKAGES = {
            "org.apache.datawise.backend.controller..",
            "org.apache.datawise.backend.platform..",
            "org.apache.datawise.backend.server.."
    };

    private static final String[] BACKUP_SUBJECT_EXCLUDES = {
            "org.apache.datawise.backend.controller.backup..",
            "org.apache.datawise.backend.server.backup.."
    };

    /**
     * host.ai composition root: optional when {@code AiService} is on the classpath.
     * Kept in server so the community-plugin IPC surface stays one place.
     */
    private static final String[] AI_BRIDGE_SUBJECT_EXCLUDES = {
            "org.apache.datawise.backend.server.communityplugin.."
    };

    @ArchTest
    static final ArchRule serverMustNotDependOnAiImplementation =
            noClasses()
                    .that().resideInAnyPackage(CORE_PACKAGES)
                    .and().resideOutsideOfPackages(BACKUP_SUBJECT_EXCLUDES)
                    .and().resideOutsideOfPackages(AI_BRIDGE_SUBJECT_EXCLUDES)
                    .should().dependOnClassesThat().resideInAPackage("org.apache.datawise.backend.ai..")
                    .because("paid AI types belong in datawise-ai; Core uses SPI only "
                            + "(except CommunityPluginAiBridge for host.ai)");

    @ArchTest
    static final ArchRule serverMustNotDependOnMetadocImplementation =
            noClasses()
                    .that().resideInAnyPackage(CORE_PACKAGES)
                    .and().resideOutsideOfPackages(BACKUP_SUBJECT_EXCLUDES)
                    .should().dependOnClassesThat().resideInAPackage("org.apache.datawise.backend.metadoc..")
                    .because("MetaDoc controllers live in datawise-metadoc (Wave 19)");

    @ArchTest
    static final ArchRule serverMustNotDependOnDatagenImplementation =
            noClasses()
                    .that().resideInAnyPackage(CORE_PACKAGES)
                    .and().resideOutsideOfPackages(BACKUP_SUBJECT_EXCLUDES)
                    .should().dependOnClassesThat().resideInAPackage("org.apache.datawise.backend.datagen..")
                    .because("Datagen controllers live in datawise-datagen (Wave 19)");

    @ArchTest
    static final ArchRule serverMustNotDependOnSyncImplementation =
            noClasses()
                    .that().resideInAnyPackage(CORE_PACKAGES)
                    .and().resideOutsideOfPackages(BACKUP_SUBJECT_EXCLUDES)
                    .should().dependOnClassesThat().resideInAPackage("org.apache.datawise.backend.sync..")
                    .because("Migration lives in datawise-sync; Core routes via bean name (Wave 20)");

    @ArchTest
    static final ArchRule serverMustNotDependOnBackupImplementation =
            noClasses()
                    .that().resideInAnyPackage(CORE_PACKAGES)
                    .and().resideOutsideOfPackages(BACKUP_SUBJECT_EXCLUDES)
                    .should().dependOnClassesThat()
                    .resideInAnyPackage(
                            "org.apache.datawise.backend.backup..",
                            "org.apache.datawise.backend.database.backup..",
                            "org.apache.datawise.backend.controller.backup..",
                            "org.apache.datawise.backend.server.backup.."
                    )
                    .because("Backup engine lives in datawise-backup (Wave 21)");
}
