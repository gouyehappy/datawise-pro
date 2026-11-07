<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import {DwButton, ModulePageHeader, ModulePageRegions} from '@/core/components'
import PackStorePanel from '@/features/pack/components/PackStorePanel.vue'
import {usePluginStore} from '@/features/plugin/stores/plugin-store'
import '@/features/pack/styles/pack-store.css'

const {t} = useI18n()
const pluginStore = usePluginStore()
</script>

<template>
  <div class="module-page module-page--scroll pack-store-page">
    <div class="mp-page-wrap pack-store-page__wrap">
      <ModulePageRegions>
        <template #header>
          <ModulePageHeader
              content-class="pack-store-hero"
              :title="t('pack.title')"
              :eyebrow="t('pack.eyebrow')"
              :subtitle="t('pack.subtitle')"
          >
            <template #settings>
              <DwButton
                  variant="ghost"
                  size="sm"
                  type="button"
                  @click="pluginStore.openPluginCenter()"
              >
                {{ t('pack.actions.manage') }}
              </DwButton>
            </template>
          </ModulePageHeader>
        </template>

        <PackStorePanel @manage-switches="pluginStore.openPluginCenter()"/>
      </ModulePageRegions>
    </div>
  </div>
</template>
