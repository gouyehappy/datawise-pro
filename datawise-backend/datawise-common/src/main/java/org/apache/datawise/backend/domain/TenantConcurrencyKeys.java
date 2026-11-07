package org.apache.datawise.backend.domain;

/**
 * 将产品租户 ID 映射为 task-concurrency 的整型 slot key。
 * 与历史「userId 当 tenant」方案脱钩；同一产品租户共享并发配额。
 */
public final class TenantConcurrencyKeys {

    private TenantConcurrencyKeys() {
    }

    public static int toSlotKey(String productTenantId) {
        String id = TenantIds.normalizeOrDefault(productTenantId);
        int hash = id.hashCode() & 0x7fffffff;
        return hash == 0 ? 1 : hash;
    }
}
