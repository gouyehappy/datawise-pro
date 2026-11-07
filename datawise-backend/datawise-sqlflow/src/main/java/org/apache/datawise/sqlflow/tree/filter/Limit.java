package org.apache.datawise.sqlflow.tree.filter;

import org.apache.datawise.sqlflow.AstVisitor;
import org.apache.datawise.sqlflow.tree.Node;
import org.apache.datawise.sqlflow.tree.NodeLocation;
import org.apache.datawise.sqlflow.tree.expression.AllRows;
import org.apache.datawise.sqlflow.tree.expression.Expression;
import org.apache.datawise.sqlflow.tree.literal.LongLiteral;

import com.google.common.collect.ImmutableList;

import java.util.List;
import java.util.Objects;
import java.util.Optional;

import static com.google.common.base.MoreObjects.toStringHelper;
import static com.google.common.base.Preconditions.checkArgument;

/**
 * huaixin 2021/12/19 6:18 PM
 */
public class Limit
        extends Node
{
    private final Expression rowCount;

    public Limit(Expression rowCount)
    {
        this(Optional.empty(), rowCount);
    }

    public Limit(NodeLocation location, Expression rowCount)
    {
        this(Optional.of(location), rowCount);
    }

    public Limit(Optional<NodeLocation> location, Expression rowCount)
    {
        super(location);
        checkArgument(
                rowCount instanceof AllRows ||
                        rowCount instanceof LongLiteral,
                "unexpected rowCount class: %s",
                rowCount.getClass().getSimpleName());
        this.rowCount = rowCount;
    }

    public Expression getRowCount()
    {
        return rowCount;
    }

    @Override
    public <R, C> R accept(AstVisitor<R, C> visitor, C context)
    {
        return visitor.visitLimit(this, context);
    }

    @Override
    public List<? extends Node> getChildren()
    {
        return ImmutableList.of(rowCount);
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
        Limit o = (Limit) obj;
        return Objects.equals(rowCount, o.rowCount);
    }

    @Override
    public int hashCode()
    {
        return Objects.hash(rowCount);
    }

    @Override
    public String toString()
    {
        return toStringHelper(this)
                .add("limit", rowCount)
                .toString();
    }

    @Override
    public boolean shallowEquals(Node other)
    {
        return sameClass(this, other);
    }
}
