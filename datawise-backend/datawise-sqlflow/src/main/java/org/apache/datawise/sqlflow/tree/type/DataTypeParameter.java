package org.apache.datawise.sqlflow.tree.type;

import org.apache.datawise.sqlflow.AstVisitor;
import org.apache.datawise.sqlflow.tree.Node;
import org.apache.datawise.sqlflow.tree.NodeLocation;

import java.util.Optional;

/**
 * huaixin 2021/12/21 11:31 AM
 */
public abstract class DataTypeParameter extends Node
{
    protected DataTypeParameter(Optional<NodeLocation> location)
    {
        super(location);
    }

    @Override
    public <R, C> R accept(AstVisitor<R, C> visitor, C context)
    {
        return visitor.visitDataTypeParameter(this, context);
    }
}
