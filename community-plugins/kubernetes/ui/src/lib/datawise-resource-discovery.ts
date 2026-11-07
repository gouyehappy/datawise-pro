export interface DatawiseResourceDescriptor { group: string; version: string; resource: string; namespaced: boolean; kind?: string; verbs?: string[]; aliases?: string[] }
type Invoke = (method: string, params: Record<string, unknown>) => Promise<unknown>
type Discovery = { resources?: Array<DatawiseResourceDescriptor & { aliases?: string[] }> }
const cache = new Map<string, Promise<DatawiseResourceDescriptor[]>>()

export async function resolveDatawiseResource(connectionId: string, resource: string, invoke: Invoke): Promise<DatawiseResourceDescriptor> {
  if (!connectionId || !resource) throw new Error('connectionId and resource are required')
  let pending = cache.get(connectionId)
  if (!pending) {
    pending = invoke('kube/discover', { connectionId }).then(raw => {
      const list = (raw as Discovery)?.resources
      if (!Array.isArray(list)) throw new Error('invalid Kubernetes discovery response')
      return list
    })
    cache.set(connectionId, pending)
  }
  let resources: DatawiseResourceDescriptor[]
  try { resources = await pending } catch (error) { cache.delete(connectionId); throw error }
  resource = ({crds: 'customresourcedefinitions', hpa: 'horizontalpodautoscalers', pvc: 'persistentvolumeclaims', pv: 'persistentvolumes'} as Record<string,string>)[resource] || resource
  const found = resources.find(r => (r.resource === resource || `${r.resource}.${r.group}` === resource) || r.aliases?.includes(resource) || r.kind?.toLowerCase() === resource.toLowerCase())
  if (!found) throw new Error(`Kubernetes resource is not discovered: ${resource}`)
  return { group: found.group || '', version: found.version, resource: found.resource, namespaced: !!found.namespaced, kind: found.kind, verbs: found.verbs }
}
export function clearDatawiseResourceDiscovery(connectionId?: string): void { if (connectionId) cache.delete(connectionId); else cache.clear() }
