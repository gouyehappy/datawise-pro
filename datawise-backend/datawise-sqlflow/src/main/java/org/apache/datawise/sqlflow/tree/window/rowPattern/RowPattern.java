package org.apache.datawise.sqlflow.tree.window.rowPattern;

import org.apache.datawise.sqlflow.AstVisitor;
import org.apache.datawise.sqlflow.tree.Node;
import org.apache.datawise.sqlflow.tree.NodeLocation;

import java.util.Optional;

/**
 * huaixin 2021/12/19 9:58 PM
 */
public abstract class RowPattern extends Node
{
    protected RowPattern(Optional<NodeLocation> location)
    {
        super(location);
    }

    @Override
    public <R, C> R accept(AstVisitor<R, C> visitor, C context)
    {
        return visitor.visitRowPattern(this, context);
    }
}
