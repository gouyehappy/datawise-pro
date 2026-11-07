package org.apache.datawise.backend.configstore;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import org.springframework.web.filter.OncePerRequestFilter;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

/**
 * P2 边界门禁：config 层不得依赖 connector-api / jdbc-runtime 能力。
 */
@AnalyzeClasses(packages = {
        "org.apache.datawise.backend.configstore",
        "org.apache.datawise.backend.security",
        "org.apache.datawise.backend.service",
}, importOptions = ImportOption.DoNotIncludeTests.class)
class ConfigModuleArchitectureTest {

    @ArchTest
    static final ArchRule configMustNotDependOnForbiddenPackages =
            noClasses()
                    .should().dependOnClassesThat().resideInAnyPackage(
                            "org.apache.datawise.backend.jdbc..",
                            "org.apache.datawise.backend.connector.facade..",
                            "org.apache.datawise.backend.connector.loader..",
                            "org.apache.datawise.backend.connector.registry..",
                            "org.apache.datawise.backend.connector.api..");

    @ArchTest
    static final ArchRule configMustNotContainServletFilters =
            noClasses()
                    .should().beAssignableTo(OncePerRequestFilter.class);
}
