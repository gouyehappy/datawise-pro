package org.apache.datawise.sqlflow.metadata;

import org.apache.datawise.sqlflow.def.ColumnDef;
import org.apache.datawise.sqlflow.def.TableDef;

import java.util.ArrayList;
import java.util.List;

public class DefaultMetadataService
{

    public static SimpleMetadataService create(List<TableDef> metadataInfos)
    {
        SimpleMetadataService service = new SimpleMetadataService("def");

        List<SchemaTable> schemaTables = new ArrayList<>();
        for (TableDef table : metadataInfos) {

            List<String> columns = table.getColumns().stream().map(ColumnDef::getName).toList();
            SchemaTable schemaTable = new SchemaTable(table.getName(), columns);
            if (table.getSchema() != null) {
                schemaTables.add(new SchemaTable(table.getSchema().getName(), table.getName(), columns));
            }
            if (table.getCatalog() != null && table.getSchema() != null) {
                schemaTables.add(new SchemaTable(
                        table.getCatalog().getName(),
                        table.getSchema().getName(),
                        table.getName(),
                        columns));
            }

            schemaTables.add(schemaTable);
        }

        service.addTableMetadata(schemaTables);
        return service;
    }
}
