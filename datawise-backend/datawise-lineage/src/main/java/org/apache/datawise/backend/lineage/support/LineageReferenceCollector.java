package org.apache.datawise.backend.lineage.support;

import org.apache.datawise.backend.lineage.model.ColumnLineage;
import org.apache.datawise.backend.lineage.model.ExpressionNode;
import org.apache.datawise.backend.lineage.model.LineageParseResult;
import org.apache.datawise.backend.lineage.model.SourceKind;
import org.apache.datawise.backend.lineage.model.SourceRef;

import java.util.List;
import java.util.Locale;

public final class LineageReferenceCollector {

    private LineageReferenceCollector() {
    }

    public static boolean referencesViewModel(LineageParseResult result, String targetNormalized) {
        if (result == null || result.columns() == null) {
            return false;
        }
        for (ColumnLineage column : result.columns()) {
            if (referencesViewModel(column.sources(), targetNormalized)) {
                return true;
            }
            if (column.expressionTree() != null
                    && referencesViewModel(column.expressionTree(), targetNormalized)) {
                return true;
            }
        }
        return false;
    }

    private static boolean referencesViewModel(List<SourceRef> sources, String targetNormalized) {
        for (SourceRef source : sources) {
            if (source.kind() == SourceKind.VIEW_MODEL
                    && normalize(source.table()).equals(targetNormalized)) {
                return true;
            }
        }
        return false;
    }

    private static boolean referencesViewModel(ExpressionNode node, String targetNormalized) {
        if (node instanceof ExpressionNode.ColumnRef columnRef) {
            SourceRef ref = columnRef.ref();
            return ref.kind() == SourceKind.VIEW_MODEL
                    && normalize(ref.table()).equals(targetNormalized);
        }
        if (node instanceof ExpressionNode.Function function) {
            for (ExpressionNode arg : function.args()) {
                if (referencesViewModel(arg, targetNormalized)) {
                    return true;
                }
            }
            return false;
        }
        if (node instanceof ExpressionNode.Binary binary) {
            return referencesViewModel(binary.left(), targetNormalized)
                    || referencesViewModel(binary.right(), targetNormalized);
        }
        if (node instanceof ExpressionNode.CaseExpr caseExpr) {
            for (ExpressionNode.WhenThen when : caseExpr.whens()) {
                if (referencesViewModel(when.condition(), targetNormalized)
                        || referencesViewModel(when.result(), targetNormalized)) {
                    return true;
                }
            }
            return caseExpr.elseExpr() != null && referencesViewModel(caseExpr.elseExpr(), targetNormalized);
        }
        if (node instanceof ExpressionNode.CastExpr castExpr) {
            return referencesViewModel(castExpr.inner(), targetNormalized);
        }
        return false;
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }
}
