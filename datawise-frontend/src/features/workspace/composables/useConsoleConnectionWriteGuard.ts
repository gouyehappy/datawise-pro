import {ref, watch, type Ref} from 'vue'
import {fetchConnectionConfig} from '@/shared/config/connections-catalog.service'

/** Load connection writeGuard flag for toolbar unlock chrome. */
export function useConsoleConnectionWriteGuard(
  connectionId: Ref<string>,
  tabConnectionId: () => string | undefined,
) {
  const connectionWriteGuard = ref(false)
  watch(
    () => connectionId.value || tabConnectionId(),
    async (id) => {
      connectionWriteGuard.value = false
      if (!id) return
      try {
        const config = await fetchConnectionConfig(id)
        connectionWriteGuard.value = Boolean(config?.writeGuard)
      } catch {
        connectionWriteGuard.value = false
      }
    },
    {immediate: true},
  )
  return {connectionWriteGuard}
}
