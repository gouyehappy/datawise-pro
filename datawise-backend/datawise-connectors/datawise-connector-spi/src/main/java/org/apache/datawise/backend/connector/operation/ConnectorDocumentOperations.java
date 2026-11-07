package org.apache.datawise.backend.connector.operation;

import org.apache.datawise.backend.domain.TableDataResult;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.apache.datawise.backend.model.ConnectionEntity;

/** 文档型数据源：集合分页读取与字段推断（MongoDB 等）。 */
public interface ConnectorDocumentOperations {

    TableDataResult fetchCollectionPage(
                                        ConnectionEntity connection,
                                        String database,
                                        String collection,
                                        int offset,
                                        int limit);

    /**
     * @param filterJson optional MongoDB find filter as extended JSON; blank means match all
     */
    default TableDataResult fetchCollectionPage(
                                                ConnectionEntity connection,
                                                String database,
                                                String collection,
                                                int offset,
                                                int limit,
                                                String filterJson) {
        return fetchCollectionPage(connection, database, collection, offset, limit);
    }

    TablePropertiesResult loadCollectionProperties(
                                                   ConnectionEntity connection,
                                                   String database,
                                                   String collection);
}
