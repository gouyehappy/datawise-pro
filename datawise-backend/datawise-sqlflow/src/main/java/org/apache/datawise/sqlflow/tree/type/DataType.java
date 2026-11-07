package org.apache.datawise.sqlflow.tree.type;

import org.apache.datawise.sqlflow.tree.NodeLocation;
import org.apache.datawise.sqlflow.tree.expression.Expression;

import java.util.Optional;

/**
 * huaixin 2021/12/21 10:55 AM
 */
public abstract class DataType extends Expression
{
    public DataType(Optional<NodeLocation> location)
    {
        super(location);
    }
}
