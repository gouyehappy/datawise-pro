package org.apache.datawise.sqlflow.tree.group;

import org.apache.datawise.sqlflow.AstVisitor;
import org.apache.datawise.sqlflow.tree.Node;
import org.apache.datawise.sqlflow.tree.NodeLocation;
import org.apache.datawise.sqlflow.tree.expression.Expression;

import java.util.List;
import java.util.Optional;

/**
 * huaixin 2021/12/18 11:23 PM
 */
public abstract class GroupingElement
        extends Node
{
    protected GroupingElement(Optional<NodeLocation> location)
    {
        super(location);
    }

    public abstract List<Expression> getExpressions();

    @Override
    public <R, C> R accept(AstVisitor<R, C> visitor, C context)
    {
        return visitor.visitGroupingElement(this, context);
    }
}
