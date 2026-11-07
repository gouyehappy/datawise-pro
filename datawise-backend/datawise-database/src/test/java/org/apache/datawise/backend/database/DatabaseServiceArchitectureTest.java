package org.apache.datawise.backend.database;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import org.apache.datawise.backend.connector.ConnectorRegistry;
import org.apache.datawise.backend.ddl.CrossDialectDdlTranslator;
import org.apache.datawise.backend.jdbc.execution.JdbcQueryExecutor;
import org.apache.datawise.backend.jdbc.session.JdbcSessionManager;
import org.apache.datawise.backend.jdbc.support.SqlExecutionTracker;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

/**
 * Phase 8 边界门禁：database Service 经 {@link org.apache.datawise.backend.connector.facade.ConnectorFacade} 访问连接器能力。
 */
@AnalyzeClasses(
        packages = "org.apache.datawise.backend.database",
        importOptions = ImportOption.DoNotIncludeTests.class
)
class DatabaseServiceArchitectureTest {

    private static final DescribedPredicate<JavaClass> FORBIDDEN_CONNECTOR_INTERNALS =
            new DescribedPredicate<>("forbidden connector internals") {
                @Override
                public boolean test(JavaClass input) {
                    return input.isAssignableTo(ConnectorRegistry.class)
                            || input.isAssignableTo(JdbcQueryExecutor.class)
                            || input.isAssignableTo(JdbcSessionManager.class)
                            || input.isAssignableTo(SqlExecutionTracker.class)
                            || input.isAssignableTo(CrossDialectDdlTranslator.class);
                }
            };

    @ArchTest
    static final ArchRule servicesMustNotDependOnForbiddenConnectorInternals =
            noClasses()
                    .that().resideInAPackage("..database..")
                    .should().dependOnClassesThat(FORBIDDEN_CONNECTOR_INTERNALS);
}
