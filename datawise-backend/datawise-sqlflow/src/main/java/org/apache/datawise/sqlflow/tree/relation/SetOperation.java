package org.apache.datawise.sqlflow.tree.relation;

import org.apache.datawise.sqlflow.AstVisitor;
import org.apache.datawise.sqlflow.tree.NodeLocation;

import java.util.List;
import java.util.Optional;

/**
 * huaixin 2021/12/21 1:07 PM
 */
public abstract class SetOperation extends QueryBody
{
    private final boolean distinct;

    protected SetOperation(Optional<NodeLocation> location, boolean distinct)
    {
        super(location);
        this.distinct = distinct;
    }

    public boolean isDistinct()
    {
        return distinct;
    }

    @Override
    public <R, C> R accept(AstVisitor<R, C> visitor, C context)
    {
        return visitor.visitSetOperation(this, context);
    }

    public abstract List<Relation> getRelations();
}

