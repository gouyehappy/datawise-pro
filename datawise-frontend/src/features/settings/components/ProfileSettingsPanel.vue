<script setup lang="ts">
import {DwInlineAlert, DwButton, DwInput, DwCheckbox} from '@/core/components'
import {onMounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {authApi} from '@/api'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useAppToast} from '@/features/layout/composables/useAppToast'
import ProfileEditDialog from '@/features/settings/components/ProfileEditDialog.vue'
import ChangePasswordDialog from '@/features/settings/components/ChangePasswordDialog.vue'
import SettingsPageShell from '@/features/settings/components/SettingsPageShell.vue'
import {resolveCaughtApiErrorMessage} from '@/shared/api'

const {t} = useI18n()
const layout = useLayoutStore()
const auth = useAuthStore()
const toast = useAppToast()
const showEditDialog = ref(false)
const showPasswordDialog = ref(false)
const sessionTtlMinutes = ref(60)
const sessionSlidingRenewal = ref(true)
const savingSessionPolicy = ref(false)

onMounted(async () => {
  if (auth.isGuest) return
  try {
    const policy = await authApi.getSessionPolicy()
    sessionTtlMinutes.value = policy.ttlMinutes
    sessionSlidingRenewal.value = policy.slidingRenewal
  } catch {
    // 后端不可达时保留默认值
  }
})

function editProfile() {
  showEditDialog.value = true
}

function saveProfile(payload: { name: string; email: string }) {
  layout.updateProfile(payload.name, payload.email)
}

function changePassword() {
  showPasswordDialog.value = true
}

function onPasswordChanged() {
  layout.showSuccessToast(t('profile.changePasswordSuccess'))
}

const sessionPolicyError = ref('')

async function saveSessionPolicy() {
  if (auth.isGuest || savingSessionPolicy.value) return
  savingSessionPolicy.value = true
  sessionPolicyError.value = ''
  try {
    const policy = await authApi.updateSessionPolicy({
      ttlMinutes: sessionTtlMinutes.value,
      slidingRenewal: sessionSlidingRenewal.value,
    })
    sessionTtlMinutes.value = policy.ttlMinutes
    sessionSlidingRenewal.value = policy.slidingRenewal
    toast.success(t('settings.profile.sessionPolicySaved'))
  } catch (err) {
    sessionPolicyError.value =
        resolveCaughtApiErrorMessage(err, t, 'settings.profile.sessionPolicySaveFailed')
  } finally {
    savingSessionPolicy.value = false
  }
}
</script>

<template>
  <SettingsPageShell
      :title="t('settings.profile.title')"
      :subtitle="t('settings.profile.subtitle')"
  >
    <div class="settings-groups profile-settings">
      <section class="profile-card">
        <div class="avatar">{{ layout.profileName.charAt(0) }}</div>
        <div class="info">
          <div class="name">{{ layout.profileName }}</div>
          <div class="email">{{ layout.profileEmail }}</div>
        </div>
      </section>

      <div class="actions">
        <DwButton variant="secondary" type="button" @click="editProfile">{{ t('profile.editProfile') }}</DwButton>
        <DwButton v-if="!auth.isGuest" variant="secondary" type="button" @click="changePassword">{{ t('profile.changePassword') }}</DwButton>
      </div>

      <section v-if="!auth.isGuest && auth.isAdmin" class="setting-block session-policy">
        <h3>{{ t('settings.profile.sessionPolicyTitle') }}</h3>
        <p class="session-policy__hint hint">{{ t('settings.profile.sessionPolicyHint') }}</p>
        <label class="session-policy__field">
          <span>{{ t('settings.profile.sessionTtlMinutes') }}</span>
          <DwInput
              v-model="sessionTtlMinutes"
              type="number"
              :min="5"
              :max="1440"
              :step="5"
          />
        </label>
        <DwCheckbox v-model="sessionSlidingRenewal" class="session-policy__checkbox">
          {{ t('settings.profile.sessionSlidingRenewal') }}
        </DwCheckbox>
        <DwButton
            variant="secondary"
            type="button"
            :loading="savingSessionPolicy"
            :disabled="savingSessionPolicy"
            @click="saveSessionPolicy"
        >
          {{ t('settings.profile.sessionPolicySave') }}
        </DwButton>
        <DwInlineAlert :message="sessionPolicyError"/>
      </section>
    </div>

    <ProfileEditDialog
        v-model:open="showEditDialog"
        :name="layout.profileName"
        :email="layout.profileEmail"
        @save="saveProfile"
    />
    <ChangePasswordDialog
        v-model:open="showPasswordDialog"
        @success="onPasswordChanged"
    />
  </SettingsPageShell>
</template>
