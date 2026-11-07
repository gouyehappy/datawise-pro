package org.apache.datawise.backend.lineage.support;

import org.apache.datawise.backend.domain.LineageDialectCompatibility;
import org.apache.datawise.backend.lineage.model.ColumnLineage;
import org.apache.datawise.backend.lineage.model.ExpressionNode;
import org.apache.datawise.backend.lineage.model.LineageParseResult;
import org.apache.datawise.backend.lineage.model.ParseStatus;
import org.apache.datawise.backend.lineage.model.SourceKind;
import org.apache.datawise.backend.lineage.model.SourceRef;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LineageReferenceCollectorTest {

    @Test
    void detectsDirectViewModelReference() {
        LineageParseResult result = new LineageParseResult(
                List.of(new ColumnLineage(
                        "id",
                        List.of(viewModelSource("orders_base", "id")),
                        null
                )),
                List.of(),
                ParseStatus.COMPLETE,
                "test",
                "1",
                LineageDialectCompatibility.UNKNOWN
        );
        assertTrue(LineageReferenceCollector.referencesViewModel(result, "orders_base"));
        assertFalse(LineageReferenceCollector.referencesViewModel(result, "other_model"));
    }

    @Test
    void detectsNestedViewModelReferenceInExpression() {
        LineageParseResult result = new LineageParseResult(
                List.of(new ColumnLineage(
                        "total",
                        List.of(),
                        new ExpressionNode.Function(
                                "SUM",
                                List.of(new ExpressionNode.ColumnRef(viewModelSource("orders_base", "amount")))
                        )
                )),
                List.of(),
                ParseStatus.COMPLETE,
                "test",
                "1",
                LineageDialectCompatibility.UNKNOWN
        );
        assertTrue(LineageReferenceCollector.referencesViewModel(result, "orders_base"));
    }

    private static SourceRef viewModelSource(String modelName, String column) {
        return new SourceRef(
                "conn-1",
                "demo",
                null,
                modelName,
                column,
                modelName,
                SourceKind.VIEW_MODEL
        );
    }
}
