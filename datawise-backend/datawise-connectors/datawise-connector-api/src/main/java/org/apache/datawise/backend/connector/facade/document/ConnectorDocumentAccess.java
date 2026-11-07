package org.apache.datawise.backend.connector.facade.document;

import org.apache.datawise.backend.connector.facade.catalog.ConnectorCatalogAccess;
import org.apache.datawise.backend.domain.TableDataResult;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.springframework.stereotype.Component;

/** 文档型数据源（MongoDB 等）集合读取入口。 */
@Component
public class ConnectorDocumentAccess {

    private final ConnectorCatalogAccess catalog;

    public ConnectorDocumentAccess(ConnectorCatalogAccess catalog) {
        this.catalog = catalog;
    }

    public TableDataResult fetchCollectionPage(
                                               ConnectionEntity connection,
                                               String database,
                                               String collection,
                                               int offset,
                                               int limit) {
        return fetchCollectionPage(connection, database, collection, offset, limit, null);
    }

    public TableDataResult fetchCollectionPage(
                                               ConnectionEntity connection,
                                               String database,
                                               String collection,
                                               int offset,
                                               int limit,
                                               String filterJson) {
        return catalog.resolve(connection).document().fetchCollectionPage(
                connection,
                database,
                collection,
                offset,
                limit,
                filterJson);
    }

    public TablePropertiesResult loadCollectionProperties(
                                                          ConnectionEntity connection,
                                                          String database,
                                                          String collection) {
        return catalog.resolve(connection).document().loadCollectionProperties(
                connection,
                database,
                collection);
    }
}
