package org.apache.datawise.sqlflow.analyzer;

import org.apache.datawise.sqlflow.SqlFlowException;
import org.apache.datawise.sqlflow.tree.Node;
import org.apache.datawise.sqlflow.tree.QualifiedName;
import org.apache.datawise.sqlflow.tree.expression.Expression;

import static java.lang.String.format;

/**
 * huaixin 2021/12/24 11:34 AM
 */
public class SemanticExceptions
{

    private SemanticExceptions()
    {
    }

    public static SqlFlowException missingAttributeException(Expression node, QualifiedName name)
    {
        throw semanticException(node, "Column '%s' cannot be resolved", name);
    }

    public static SqlFlowException ambiguousAttributeException(Expression node, QualifiedName name)
    {
        throw semanticException(node, "Column '%s' is ambiguous", name);
    }

    public static SqlFlowException semanticException(Node node, String format, Object... args)
    {
        return semanticException(node, null, format, args);
    }

    public static SqlFlowException semanticException(Node node, Throwable cause, String format, Object... args)
    {
        throw new SqlFlowException(ExpressionTreeUtils.extractLocation(node), format(format, args), cause);
    }
}
