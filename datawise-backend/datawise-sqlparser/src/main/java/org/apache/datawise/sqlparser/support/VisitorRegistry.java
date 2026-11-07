package org.apache.datawise.sqlparser.support;

import org.apache.datawise.sqlparser.VisitorContext;
import org.apache.datawise.sqlparser.visitors.RecursiveExpressionVisitor;
import org.apache.datawise.sqlparser.visitors.RecursiveFromItemVisitor;
import org.apache.datawise.sqlparser.visitors.RecursiveItemListVisitor;
import org.apache.datawise.sqlparser.visitors.RecursiveSelectItemVisitor;
import org.apache.datawise.sqlparser.visitors.RecursiveSelectVisitor;

/**
 * Lazily creates and reuses recursive visitors for a single traversal pass.
 */
public final class VisitorRegistry {

    private final VisitorContext context;
    private RecursiveSelectVisitor selectVisitor;
    private RecursiveFromItemVisitor fromItemVisitor;
    private RecursiveExpressionVisitor expressionVisitor;
    private RecursiveSelectItemVisitor selectItemVisitor;
    private RecursiveItemListVisitor itemListVisitor;

    public VisitorRegistry(VisitorContext context) {
        this.context = context;
    }

    public VisitorContext context() {
        return context;
    }

    public RecursiveSelectVisitor selectVisitor() {
        if (selectVisitor == null) {
            selectVisitor = new RecursiveSelectVisitor(context, this);
        }
        return selectVisitor;
    }

    public RecursiveFromItemVisitor fromItemVisitor() {
        if (fromItemVisitor == null) {
            fromItemVisitor = new RecursiveFromItemVisitor(context, this);
        }
        return fromItemVisitor;
    }

    public RecursiveExpressionVisitor expressionVisitor() {
        if (expressionVisitor == null) {
            expressionVisitor = new RecursiveExpressionVisitor(context, this);
        }
        return expressionVisitor;
    }

    public RecursiveSelectItemVisitor selectItemVisitor() {
        if (selectItemVisitor == null) {
            selectItemVisitor = new RecursiveSelectItemVisitor(context, this);
        }
        return selectItemVisitor;
    }

    public RecursiveItemListVisitor itemListVisitor() {
        if (itemListVisitor == null) {
            itemListVisitor = new RecursiveItemListVisitor(context, this);
        }
        return itemListVisitor;
    }
}
