import {defineStore} from 'pinia'
import {ref} from 'vue'
import {
  createHttpCommunityPluginsApi,
  type CommunityPluginInfo,
} from '@/shared/api/http/community-plugins'

export type CommunityContributionRef = {
  pluginId: string
  pluginName: string
  type: string
  id: string
  label: string
  menu?: string
}

/**
 * Cached contribution index for host surfaces (explorer menus, result views).
 */
export const useCommunityPluginContributionStore = defineStore('communityPluginContributions', () => {
  const plugins = ref<CommunityPluginInfo[]>([])
  const loaded = ref(false)
  const loading = ref(false)
  const api = createHttpCommunityPluginsApi()

  async function refresh() {
    if (loading.value) return
    loading.value = true
    try {
      plugins.value = await api.list()
      loaded.value = true
    } catch {
      plugins.value = []
      loaded.value = true
    } finally {
      loading.value = false
    }
  }

  function ensureLoaded() {
    if (!loaded.value && !loading.value) {
      void refresh()
    }
  }

  function contributionsOfType(type: string): CommunityContributionRef[] {
    const out: CommunityContributionRef[] = []
    for (const plugin of plugins.value) {
      if (!plugin.compatibility?.compatible) continue
      const list = (plugin.manifest.contributions || []) as Array<{
        type?: string
        id?: string
        label?: string
        menu?: string
      }>
      for (const c of list) {
        if (c.type !== type || !c.id) continue
        out.push({
          pluginId: plugin.manifest.id,
          pluginName: plugin.manifest.name,
          type: c.type,
          id: c.id,
          label: c.label || c.id,
          menu: c.menu,
        })
      }
    }
    return out
  }

  function contextMenusFor(menu: string): CommunityContributionRef[] {
    return contributionsOfType('context-menu').filter((c) => !c.menu || c.menu === menu)
  }

  function resultViews(): CommunityContributionRef[] {
    return contributionsOfType('result-view')
  }

  return {
    plugins,
    loaded,
    loading,
    refresh,
    ensureLoaded,
    contributionsOfType,
    contextMenusFor,
    resultViews,
  }
})
