<script setup lang="ts">
import {ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {AppDrawer, DwButton, DwCheckbox, DwInput, IconButton} from '@/core/components'
import {DwIcon} from '@/core/icons'
import type {CommunityPluginRepository, CommunityPluginTrustKey} from '@/shared/api/http/community-plugins'
import {
  listRememberedChallenges,
  removeRememberedChallenge,
  type RememberedChallenge,
} from '@/features/community-plugin/lib/challengeTrust'

const props = defineProps<{
  open: boolean
  trustKeys: CommunityPluginTrustKey[]
  repositories: CommunityPluginRepository[]
  trustKeyDraft: {id: string; label: string; publicKeyBase64: string}
  repoDraft: {id: string; name: string; url: string; enabled: boolean}
  savingTrust: boolean
  savingRepos: boolean
  allowUnsigned: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'update:allowUnsigned', value: boolean): void
  (e: 'patchTrustKeyDraft', patch: Partial<{id: string; label: string; publicKeyBase64: string}>): void
  (e: 'patchRepoDraft', patch: Partial<{id: string; name: string; url: string; enabled: boolean}>): void
  (e: 'addTrustKey'): void
  (e: 'removeTrustKey', keyId: string): void
  (e: 'addRepository'): void
  (e: 'removeRepository', repoId: string): void
  (e: 'dragOver', event: DragEvent): void
  (e: 'dropFile', event: DragEvent): void
  (e: 'chooseFile'): void
}>()

const {t} = useI18n()

// Challenge fingerprints accepted with "remember" (TOFU) — local-only state,
// so this section manages itself instead of routing through the parent.
const rememberedChallenges = ref<RememberedChallenge[]>([])

function reloadRememberedChallenges() {
  rememberedChallenges.value = listRememberedChallenges()
}

watch(
    () => props.open,
    (open) => {
      if (open) reloadRememberedChallenges()
    },
    {immediate: true},
)

function onRemoveRememberedChallenge(entry: RememberedChallenge) {
  removeRememberedChallenge(entry)
  reloadRememberedChallenges()
}
</script>

<template>
  <AppDrawer
      :open="open"
      :ariaLabel="t('communityPlugin.settingsTitle')"
      width="min(440px, 100vw)"
      @close="emit('close')"
  >
    <div class="community-plugin-settings-drawer">
      <header class="community-plugin-settings-drawer__head">
        <div>
          <h2 class="community-plugin-settings-drawer__title">{{ t('communityPlugin.settingsTitle') }}</h2>
          <p class="community-plugin-muted">{{ t('communityPlugin.tracksHint') }}</p>
        </div>
        <IconButton size="sm" :title="t('common.close')" @click="emit('close')">
          <DwIcon name="close" size="sm"/>
        </IconButton>
      </header>

      <section class="community-plugin-settings-drawer__section">
        <h3 class="community-plugin-section-title">{{ t('communityPlugin.trustKeysTitle') }}</h3>
        <p class="community-plugin-muted">{{ t('communityPlugin.trustKeysHint') }}</p>
        <ul class="community-plugin-trust-list">
          <li v-for="key in trustKeys" :key="key.id" class="community-plugin-trust-item">
            <div class="community-plugin-trust-item__copy">
              <strong>{{ key.label || key.id }}</strong>
              <span class="community-plugin-muted">{{ key.id }}</span>
            </div>
            <DwButton variant="ghost" size="sm" :disabled="savingTrust" @click="emit('removeTrustKey', key.id)">
              {{ t('communityPlugin.trustKeyRemove') }}
            </DwButton>
          </li>
          <li v-if="!trustKeys.length" class="community-plugin-muted">
            {{ t('communityPlugin.trustKeysEmpty') }}
          </li>
        </ul>
        <div class="community-plugin-trust-form">
          <DwInput
              :model-value="trustKeyDraft.id"
              :placeholder="t('communityPlugin.trustKeyId')"
              @update:model-value="emit('patchTrustKeyDraft', {id: String($event ?? '')})"
          />
          <DwInput
              :model-value="trustKeyDraft.label"
              :placeholder="t('communityPlugin.trustKeyLabel')"
              @update:model-value="emit('patchTrustKeyDraft', {label: String($event ?? '')})"
          />
          <DwInput
              :model-value="trustKeyDraft.publicKeyBase64"
              :placeholder="t('communityPlugin.trustKeyPublic')"
              @update:model-value="emit('patchTrustKeyDraft', {publicKeyBase64: String($event ?? '')})"
          />
          <DwButton
              size="sm"
              :disabled="savingTrust || !trustKeyDraft.id.trim() || !trustKeyDraft.publicKeyBase64.trim()"
              :loading="savingTrust"
              @click="emit('addTrustKey')"
          >
            {{ t('communityPlugin.trustKeyAdd') }}
          </DwButton>
        </div>
      </section>

      <section class="community-plugin-settings-drawer__section">
        <h3 class="community-plugin-section-title">{{ t('communityPlugin.repositoriesTitle') }}</h3>
        <p class="community-plugin-muted">{{ t('communityPlugin.repositoriesHint') }}</p>
        <ul class="community-plugin-trust-list">
          <li v-for="repo in repositories" :key="repo.id" class="community-plugin-trust-item">
            <div class="community-plugin-trust-item__copy">
              <strong>{{ repo.name || repo.id }}</strong>
              <span class="community-plugin-muted">{{ repo.url }}</span>
            </div>
            <DwButton variant="ghost" size="sm" :disabled="savingRepos" @click="emit('removeRepository', repo.id)">
              {{ t('communityPlugin.repositoryRemove') }}
            </DwButton>
          </li>
          <li v-if="!repositories.length" class="community-plugin-muted">
            {{ t('communityPlugin.repositoriesEmpty') }}
          </li>
        </ul>
        <div class="community-plugin-trust-form">
          <DwInput
              :model-value="repoDraft.id"
              :placeholder="t('communityPlugin.repositoryId')"
              @update:model-value="emit('patchRepoDraft', {id: String($event ?? '')})"
          />
          <DwInput
              :model-value="repoDraft.name"
              :placeholder="t('communityPlugin.repositoryName')"
              @update:model-value="emit('patchRepoDraft', {name: String($event ?? '')})"
          />
          <DwInput
              :model-value="repoDraft.url"
              :placeholder="t('communityPlugin.repositoryUrl')"
              @update:model-value="emit('patchRepoDraft', {url: String($event ?? '')})"
          />
          <DwButton
              size="sm"
              :disabled="savingRepos || !repoDraft.id.trim() || !repoDraft.url.trim()"
              :loading="savingRepos"
              @click="emit('addRepository')"
          >
            {{ t('communityPlugin.repositoryAdd') }}
          </DwButton>
        </div>
      </section>

      <section class="community-plugin-settings-drawer__section">
        <h3 class="community-plugin-section-title">{{ t('communityPlugin.challengeTrustTitle') }}</h3>
        <p class="community-plugin-muted">{{ t('communityPlugin.challengeTrustHint') }}</p>
        <ul class="community-plugin-trust-list">
          <li
              v-for="entry in rememberedChallenges"
              :key="`${entry.pluginId}|${entry.kind}|${entry.host}|${entry.port}|${entry.fingerprint}`"
              class="community-plugin-trust-item"
          >
            <div class="community-plugin-trust-item__copy">
              <strong>{{ entry.host }}:{{ entry.port }}</strong>
              <span class="community-plugin-trust-item__mono">{{ entry.fingerprint }}</span>
              <span class="community-plugin-muted">
                {{ t('communityPlugin.challengeTrustEntry', {kind: entry.kind, plugin: entry.pluginId}) }}
              </span>
            </div>
            <DwButton variant="ghost" size="sm" @click="onRemoveRememberedChallenge(entry)">
              {{ t('communityPlugin.challengeTrustRemove') }}
            </DwButton>
          </li>
          <li v-if="!rememberedChallenges.length" class="community-plugin-muted">
            {{ t('communityPlugin.challengeTrustEmpty') }}
          </li>
        </ul>
      </section>

      <section class="community-plugin-settings-drawer__section">
        <h3 class="community-plugin-section-title">{{ t('communityPlugin.allowUnsigned') }}</h3>
        <DwCheckbox
            :model-value="allowUnsigned"
            :label="t('communityPlugin.allowUnsigned')"
            @update:model-value="emit('update:allowUnsigned', Boolean($event))"
        />
        <p class="community-plugin-warning">{{ t('communityPlugin.allowUnsignedWarning') }}</p>
      </section>

      <section class="community-plugin-settings-drawer__section">
        <h3 class="community-plugin-section-title">{{ t('communityPlugin.dropZoneTitle') }}</h3>
        <p class="community-plugin-muted">{{ t('communityPlugin.dropZoneHint') }}</p>
        <div
            class="community-plugin-drop"
            @dragover="emit('dragOver', $event)"
            @drop="emit('dropFile', $event)"
        >
          <p class="community-plugin-drop__title">{{ t('communityPlugin.dropHint') }}</p>
          <DwButton variant="secondary" size="sm" @click="emit('chooseFile')">
            {{ t('communityPlugin.chooseFile') }}
          </DwButton>
        </div>
      </section>
    </div>
  </AppDrawer>
</template>
