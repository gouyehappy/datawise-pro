import type {SelectOption} from '@/core/components/select.types'
import type {K8sNamespaceSummary} from '@/features/explorer/services/k8s-workloads.service'

export type K8sNamespaceOptionsConfig = {
  /**
   * Prepend an empty-value option (e.g. Apply: “use namespace from YAML”).
   * List panels should omit this — clear means empty selection, no fetch.
   */
  includeAll?: boolean
  allLabel?: string
  /** Keep the current selection visible before the namespace list finishes loading. */
  currentValue?: string
}

/** Shared Namespace options for DwSelect across K8s panels. */
export function toK8sNamespaceOptions(
    namespaces: readonly K8sNamespaceSummary[],
    config?: K8sNamespaceOptionsConfig,
): SelectOption[] {
  const items = namespaces
      .map((item) => ({value: item.name ?? '', label: item.name ?? ''}))
      .filter((item) => item.value)

  const current = config?.currentValue?.trim()
  if (current && !items.some((item) => item.value === current)) {
    items.unshift({value: current, label: current})
  }

  if (!config?.includeAll) return items

  return [
    {value: '', label: config.allLabel?.trim() || 'All namespaces'},
    ...items,
  ]
}
