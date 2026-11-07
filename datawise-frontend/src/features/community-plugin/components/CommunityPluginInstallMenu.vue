<script setup lang="ts">
import {ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwButton, DwInput} from '@/core/components'
import {DwIcon} from '@/core/icons'
import {usePopoverEscape} from '@/core/composables/usePopoverEscape'

const props = defineProps<{
  installPath: string
  installUrl: string
  installing: boolean
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'update:installPath': [value: string]
  'update:installUrl': [value: string]
  chooseFile: []
  installPath: []
  installUrl: []
}>()

const {t} = useI18n()
const rootRef = ref<HTMLElement | null>(null)
const openRef = ref(props.open)

watch(() => props.open, (value) => {
  openRef.value = value
})

usePopoverEscape(openRef, () => emit('update:open', false), {
  containRefs: () => [rootRef.value],
})

function syncOpen(value: boolean) {
  openRef.value = value
  emit('update:open', value)
}

function onChooseFile() {
  syncOpen(false)
  emit('chooseFile')
}

function onToggleMore() {
  syncOpen(!props.open)
}
</script>

<template>
  <div ref="rootRef" class="community-plugin-install-menu">
    <div
        class="community-plugin-install-menu__split"
        :class="{ 'is-open': open, 'is-busy': installing }"
    >
      <button
          type="button"
          class="community-plugin-install-menu__main"
          :disabled="installing"
          :title="t('communityPlugin.chooseFile')"
          @click="onChooseFile"
      >
        <DwIcon name="import" size="sm" aria-hidden="true"/>
        <span>{{ t('communityPlugin.installMenu') }}</span>
      </button>
      <button
          type="button"
          class="community-plugin-install-menu__more"
          :aria-expanded="open"
          aria-haspopup="menu"
          :disabled="installing"
          :title="t('communityPlugin.installMore')"
          @click="onToggleMore"
      >
        <DwIcon
            name="chevron-down"
            size="sm"
            class="community-plugin-install-menu__chevron"
            :class="{ 'is-open': open }"
        />
      </button>
    </div>

    <div
        v-if="open"
        class="community-plugin-install-menu__panel"
        role="menu"
    >
      <p class="community-plugin-install-menu__hint">{{ t('communityPlugin.installMoreHint') }}</p>

      <div class="community-plugin-install-menu__field">
        <label class="community-plugin-install-menu__label">{{ t('communityPlugin.installFromUrl') }}</label>
        <div class="community-plugin-install-menu__row">
          <DwInput
              :model-value="installUrl"
              variant="sm"
              :placeholder="t('communityPlugin.installUrlPlaceholder')"
              @update:model-value="emit('update:installUrl', String($event ?? ''))"
          />
          <DwButton
              size="sm"
              :disabled="installing || !installUrl.trim()"
              :loading="installing && !!installUrl.trim()"
              @click="emit('installUrl')"
          >
            {{ t('communityPlugin.install') }}
          </DwButton>
        </div>
      </div>

      <div class="community-plugin-install-menu__field">
        <label class="community-plugin-install-menu__label">{{ t('communityPlugin.installPathLabel') }}</label>
        <div class="community-plugin-install-menu__row">
          <DwInput
              :model-value="installPath"
              variant="sm"
              :placeholder="t('communityPlugin.installPathPlaceholder')"
              @update:model-value="emit('update:installPath', String($event ?? ''))"
          />
          <DwButton
              size="sm"
              variant="secondary"
              :disabled="installing || !installPath.trim()"
              :loading="installing && !installUrl.trim()"
              @click="emit('installPath')"
          >
            {{ t('communityPlugin.install') }}
          </DwButton>
        </div>
      </div>
    </div>
  </div>
</template>
