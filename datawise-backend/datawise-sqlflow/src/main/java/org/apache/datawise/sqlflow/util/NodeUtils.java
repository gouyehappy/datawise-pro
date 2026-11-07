package org.apache.datawise.sqlflow.util;

import org.apache.datawise.sqlflow.tree.OrderBy;
import org.apache.datawise.sqlflow.tree.Property;
import org.apache.datawise.sqlflow.tree.SortItem;
import org.apache.datawise.sqlflow.tree.expression.Expression;

import com.google.common.collect.ImmutableList;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static com.google.common.collect.ImmutableMap.toImmutableMap;

public final class NodeUtils
{
    private NodeUtils()
    {
    }

    public static List<SortItem> getSortItemsFromOrderBy(Optional<OrderBy> orderBy)
    {
        return orderBy.map(OrderBy::getSortItems).orElse(ImmutableList.of());
    }

    public static Map<String, Expression> mapFromProperties(List<Property> properties)
    {
        return properties.stream().collect(toImmutableMap(
                property -> property.getName().getValue(),
                Property::getValue));
    }
}
