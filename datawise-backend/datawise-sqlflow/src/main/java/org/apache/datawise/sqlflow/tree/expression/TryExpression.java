package org.apache.datawise.sqlflow.tree.expression;

import org.apache.datawise.sqlflow.AstVisitor;
import org.apache.datawise.sqlflow.tree.Node;
import org.apache.datawise.sqlflow.tree.NodeLocation;

import com.google.common.collect.ImmutableList;

import java.util.List;
import java.util.Objects;
import java.util.Optional;

import static java.util.Objects.requireNonNull;

/**
 * huaixin 2021/12/21 10:53 AM
 */
public class TryExpression
        extends Expression
{
    private final Expression innerExpression;

    public TryExpression(Expression innerExpression)
    {
        this(Optional.empty(), innerExpression);
    }

    public TryExpression(NodeLocation location, Expression innerExpression)
    {
        this(Optional.of(location), innerExpression);
    }

    private TryExpression(Optional<NodeLocation> location, Expression innerExpression)
    {
        super(location);
        this.innerExpression = requireNonNull(innerExpression, "innerExpression is null");
    }

    public Expression getInnerExpression()
    {
        return innerExpression;
    }

    @Override
    public <R, C> R accept(AstVisitor<R, C> visitor, C context)
    {
        return visitor.visitTryExpression(this, context);
    }

    @Override
    public List<? extends Node> getChildren()
    {
        return ImmutableList.of(innerExpression);
    }

    @Override
    public boolean equals(Object obj)
    {
        if (this == obj) {
            return true;
        }
        if ((obj == null) || (getClass() != obj.getClass())) {
            return false;
        }
        TryExpression o = (TryExpression) obj;
        return Objects.equals(innerExpression, o.innerExpression);
    }

    @Override
    public int hashCode()
    {
        return Objects.hash(innerExpression);
    }

    @Override
    public boolean shallowEquals(Node other)
    {
        return Node.sameClass(this, other);
    }
}
