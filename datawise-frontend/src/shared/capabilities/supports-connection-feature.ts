/**
 * 产品能力矩阵统一入口：matrix ∧（部分能力再 AND catalog SPI）。
 * 权限 / entitlement 由调用方继续 AND（见 CONNECTION_CAPABILITY_MATRIX 规格）。
 */
import type {DbType} from '@/core/types'
import type {DatasourceDefinition} from '@/shared/api/datasource.types'
import {
    CONNECTION_CAPABILITY_MATRIX,
    type ConnectionCapabilityProfile,
    type ConnectionFormKind,
    type ConnectionProductFeature,
    type ConnectionSupportLevel,
} from '@/shared/capabilities/generated/connection-capability-matrix'
import type {ContextMenuItem} from '@/core/types'
import {
    filterConnectionCapabilityMenuItems,
    filterContextMenuByIds,
    isCsvImportSupported,
    supportsSqlExecute,
    supportsSqlExplain,
    supportsTableMutation,
} from '@/shared/capabilities/db-type-capabilities'

export type {ConnectionProductFeature, ConnectionSupportLevel, ConnectionFormKind, ConnectionCapabilityProfile}

const CONSERVATIVE_DEFAULT: ConnectionCapabilityProfile = {
    dbType: '*',
    supportLevel: 'browse',
    specializedSurface: false,
    formKind: 'other',
    features: Object.fromEntries(
        CONNECTION_CAPABILITY_MATRIX.featureKeys.map((k) => [k, k === 'metadataBrowse']),
    ) as Record<ConnectionProductFeature, boolean>,
}

function canonicalDbType(dbType: string | undefined): string {
    if (!dbType) return ''
    const key = dbType.trim().toLowerCase()
    return key === 'dameng' ? 'dm' : key
}

/** 解析声明式产品能力档案；未标定类型走保守默认。 */
export function getConnectionCapabilityProfile(
    dbType: string | DbType | undefined,
): ConnectionCapabilityProfile {
    const key = canonicalDbType(dbType == null ? undefined : String(dbType))
    if (!key) return CONSERVATIVE_DEFAULT
    return CONNECTION_CAPABILITY_MATRIX.types[key] ?? {...CONSERVATIVE_DEFAULT, dbType: key}
}

export function isSpecializedSurface(dbType: string | DbType | undefined): boolean {
    return getConnectionCapabilityProfile(dbType).specializedSurface
}

/**
 * Whether the connection form should offer the owner "allow engine writes" toggle.
 * Only JDBC-shaped engines that ship query-only (e.g. Trino) — not specialized
 * plugin/ops/SSH surfaces where the Trino-style DDL gate does not apply.
 */
export function needsEngineWriteOverrideOption(dbType: string | DbType | undefined): boolean {
    const profile = getConnectionCapabilityProfile(dbType)
    if (profile.specializedSurface || profile.formKind !== 'jdbc') {
        return false
    }
    return !profile.features.tableDataEdit || !profile.features.tableStructureEdit
}

/**
 * 产品功能是否对应该引擎开放。
 * catalog 优先收窄 SPI 重叠项（queryExecution / tableDataEdit / sqlExplain / tableImport）。
 * Owner {@code allowEngineWrites} may widen tableDataEdit / tableStructureEdit only.
 */
export function supportsConnectionFeature(
    input: {
        dbType?: string | DbType | null
        connectionId?: string
        allowEngineWrites?: boolean
    },
    feature: ConnectionProductFeature,
    catalog?: readonly DatasourceDefinition[],
): boolean {
    const dbType = input.dbType == null ? undefined : (String(input.dbType) as DbType)
    if (!dbType) return false

    if (
        input.allowEngineWrites
        && (feature === 'tableDataEdit' || feature === 'tableStructureEdit')
    ) {
        return true
    }

    const profile = getConnectionCapabilityProfile(dbType)
    if (!profile.features[feature]) return false

    // SPI / catalog 可进一步收窄，不可放宽
    switch (feature) {
        case 'queryExecution':
        case 'sqlFileExecution':
            return supportsSqlExecute(dbType, catalog)
        case 'tableDataEdit':
        case 'tableStructureEdit':
        case 'dataTransfer':
            return supportsTableMutation(dbType, catalog)
        case 'sqlExplain':
            return supportsSqlExplain(dbType, catalog)
        case 'tableImport':
            return isCsvImportSupported(dbType, catalog)
        default:
            return true
    }
}

export function listConnectionProductFeatures(): readonly ConnectionProductFeature[] {
    return CONNECTION_CAPABILITY_MATRIX.featureKeys
}

const DIAGRAM_CONTEXT_MENU_IDS = new Set(['schema-er'])
const SCHEMA_COMPARE_CONTEXT_MENU_IDS = new Set(['schema-compare', 'cross-env-compare'])

/** 按产品矩阵隐藏 ER / Schema Compare 等菜单项 */
export function filterProductFeatureMenuItems(
    items: ContextMenuItem[],
    dbType: string | DbType | undefined,
    catalog?: readonly DatasourceDefinition[],
): ContextMenuItem[] {
    let next = items
    if (!supportsConnectionFeature({dbType}, 'diagram', catalog)) {
        next = filterContextMenuByIds(next, DIAGRAM_CONTEXT_MENU_IDS)
    }
    if (!supportsConnectionFeature({dbType}, 'schemaCompare', catalog)) {
        next = filterContextMenuByIds(next, SCHEMA_COMPARE_CONTEXT_MENU_IDS)
    }
    return next
}

/** SPI 菜单过滤 + 产品矩阵过滤（Explorer 右键统一入口） */
export function filterExplorerCapabilityMenuItems(
    items: ContextMenuItem[],
    dbType: DbType | undefined,
    catalog?: readonly DatasourceDefinition[],
): ContextMenuItem[] {
    return filterProductFeatureMenuItems(
        filterConnectionCapabilityMenuItems(items, dbType, catalog),
        dbType,
        catalog,
    )
}
