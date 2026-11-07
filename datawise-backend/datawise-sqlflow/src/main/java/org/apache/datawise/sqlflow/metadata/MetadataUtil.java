package org.apache.datawise.sqlflow.metadata;

import org.apache.datawise.sqlflow.SqlFlowException;
import org.apache.datawise.sqlflow.analyzer.SemanticExceptions;
import org.apache.datawise.sqlflow.tree.Node;
import org.apache.datawise.sqlflow.tree.QualifiedName;

import com.google.common.collect.Lists;

import java.util.List;

import static java.lang.String.format;
import static java.util.Objects.requireNonNull;

/**
 * huaixin 2021/12/24 11:28 AM
 */
public class MetadataUtil
{

    public static QualifiedObjectName createQualifiedObjectName(
            MetadataService metadataService,
            Node node,
            QualifiedName name)
    {
        requireNonNull(metadataService, "metadata is null");
        requireNonNull(name, "name is null");
        if (name.getParts().size() > 3) {
            throw new SqlFlowException(format("Too many dots in table name: %s", name));
        }

        List<String> parts = Lists.reverse(name.getParts());
        String objectName = parts.get(0);
        String schemaName = (parts.size() > 1) ? parts.get(1) : metadataService.getSchema().orElseThrow(() ->
                SemanticExceptions.semanticException(node, "Schema must be specified when session schema is not set"));
        String catalogName = (parts.size() > 2) ? parts.get(2) : null;

        return new QualifiedObjectName(catalogName, schemaName, objectName);
    }
}
