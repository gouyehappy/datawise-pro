package org.apache.datawise.sqlflow.tree;

import org.apache.datawise.sqlflow.AstVisitor;

import java.util.Optional;

/**
 * huaixin 2021/12/21 1:35 PM
 */
public abstract class TableElement extends Node
{
    public TableElement(Optional<NodeLocation> location)
    {
        super(location);
    }

    @Override
    public <R, C> R accept(AstVisitor<R, C> visitor, C context)
    {
        return visitor.visitTableElement(this, context);
    }
}
