package org.apache.datawise.backend.configstore;

import org.apache.datawise.backend.model.DataQualityTemplateEntity;

import java.util.List;
import java.util.Optional;

public interface DataQualityTemplateStore {

    List<DataQualityTemplateEntity> listByTenantId(String tenantId);

    Optional<DataQualityTemplateEntity> findById(String tenantId, String id);

    DataQualityTemplateEntity save(String tenantId, DataQualityTemplateEntity entity);

    void delete(String tenantId, String id);
}
