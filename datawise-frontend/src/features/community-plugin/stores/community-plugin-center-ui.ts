import {defineStore} from 'pinia'
import {ref} from 'vue'

/**
 * Lightweight intents for the singleton community-plugin-center workspace tab.
 */
export const useCommunityPluginCenterUiStore = defineStore('communityPluginCenterUi', () => {
  const pendingSelectPluginId = ref<string | null>(null)
  const pendingOpenSettings = ref(false)

  function requestSelectPlugin(pluginId: string) {
    pendingSelectPluginId.value = pluginId
  }

  function requestOpenSettings() {
    pendingOpenSettings.value = true
  }

  function consumeSelectPluginId(): string | null {
    const id = pendingSelectPluginId.value
    pendingSelectPluginId.value = null
    return id
  }

  function consumeOpenSettings(): boolean {
    const open = pendingOpenSettings.value
    pendingOpenSettings.value = false
    return open
  }

  return {
    pendingSelectPluginId,
    pendingOpenSettings,
    requestSelectPlugin,
    requestOpenSettings,
    consumeSelectPluginId,
    consumeOpenSettings,
  }
})
