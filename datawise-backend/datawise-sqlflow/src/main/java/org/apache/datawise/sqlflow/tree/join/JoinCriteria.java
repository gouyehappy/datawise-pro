package org.apache.datawise.sqlflow.tree.join;

import org.apache.datawise.sqlflow.tree.Node;

import java.util.List;

/**
 * huaixin 2021/12/19 12:10 AM
 */
public abstract class JoinCriteria
{
    // Force subclasses to have a proper equals and hashcode implementation
    @Override
    public abstract boolean equals(Object obj);

    @Override
    public abstract int hashCode();

    @Override
    public abstract String toString();

    public abstract List<Node> getNodes();
}
