<script setup lang="ts">
import {computed, onMounted, reactive, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {AppModal, DwButton, DwCheckbox, DwInput, DwSecretInput, FormField, ModalActions, DwInlineAlert} from '@/core/components'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {useAppToast} from '@/features/layout/composables/useAppToast'
import {authApi} from '@/api'
import {API_PATHS} from '@/shared/api'
import {resolveDisplayApiErrorMessage} from '@/shared/api/http/api-error-message'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean]; success: [] }>()

const {t} = useI18n()
const auth = useAuthStore()
const toast = useAppToast()

const loading = ref(false)
const mode = ref<'login' | 'register'>('login')
const isDev = import.meta.env.DEV
const localLoginEnabled = ref(true)
const oidcEnabled = ref(false)
const registrationEnabled = ref(false)
const tenantCreateEnabled = ref(false)

const form = reactive({
  userName: isDev ? 'admin' : '',
  userPassword: '',
  tenantName: '',
  createTenant: false,
})

const errors = reactive({
  userName: '',
  userPassword: '',
  tenantName: '',
  form: '',
})

const showLocalForm = computed(() => localLoginEnabled.value)
const isRegister = computed(() => mode.value === 'register')
const dialogTitle = computed(() =>
  isRegister.value ? t('auth.registerTitle') : t('auth.dialogTitle'),
)
const dialogSubtitle = computed(() =>
  isRegister.value ? t('auth.registerSubtitle') : t('auth.dialogSubtitle'),
)

async function loadOptions() {
  try {
    const options = await authApi.getLoginOptions()
    localLoginEnabled.value = options.localLoginEnabled
    oidcEnabled.value = options.oidcEnabled
    registrationEnabled.value = options.registrationEnabled === true
    tenantCreateEnabled.value = options.tenantCreateEnabled === true
    if (!registrationEnabled.value) mode.value = 'login'
  } catch {
    localLoginEnabled.value = true
    oidcEnabled.value = false
    registrationEnabled.value = false
    tenantCreateEnabled.value = false
  }
}

watch(
    () => props.open,
    async (isOpen) => {
      if (!isOpen) return
      mode.value = 'login'
      errors.userName = ''
      errors.userPassword = ''
      errors.tenantName = ''
      errors.form = ''
      form.userPassword = ''
      form.tenantName = ''
      form.createTenant = false
      if (!form.userName && isDev) form.userName = 'admin'
      await loadOptions()
    },
)

onMounted(loadOptions)

function close() {
  emit('update:open', false)
}

function clearErrors() {
  errors.userName = ''
  errors.userPassword = ''
  errors.tenantName = ''
  errors.form = ''
}

function validateForm(): boolean {
  clearErrors()
  let valid = true
  if (showLocalForm.value) {
    if (!form.userName.trim()) {
      errors.userName = t('auth.usernameRequired')
      valid = false
    }
    if (!form.userPassword) {
      errors.userPassword = t('auth.passwordRequired')
      valid = false
    } else if (isRegister.value && form.userPassword.length < 6) {
      errors.userPassword = t('auth.passwordTooShort')
      valid = false
    }
    if (isRegister.value && form.createTenant && tenantCreateEnabled.value && !form.tenantName.trim()) {
      errors.tenantName = t('auth.tenantNameRequired')
      valid = false
    }
  }
  return valid
}

function resolveErrorMessage(err: unknown): string {
  if (!(err instanceof Error) || !err.message.trim()) {
    return t('auth.failed')
  }
  return resolveDisplayApiErrorMessage(err, (key) => String(t(key)))
}

async function handleSubmit() {
  if (loading.value) return
  if (!showLocalForm.value) return
  if (!validateForm()) return

  loading.value = true
  clearErrors()
  try {
    if (isRegister.value) {
      await auth.register({
        userName: form.userName.trim(),
        password: form.userPassword,
        createTenant: form.createTenant && tenantCreateEnabled.value,
        tenantName: form.createTenant ? form.tenantName.trim() : undefined,
      })
      // Session apply already closes the dialog; toast after so sign-in feels instant.
      emit('success')
    } else {
      await auth.login(form.userName.trim(), form.userPassword)
      emit('success')
    }
  } catch (err) {
    errors.form = resolveErrorMessage(err)
  } finally {
    loading.value = false
  }
}

function startOidcLogin() {
  window.location.href = API_PATHS.auth.oidcLogin
}

function toggleMode() {
  mode.value = isRegister.value ? 'login' : 'register'
  clearErrors()
  form.userPassword = ''
}

function onFormKeydown(e: KeyboardEvent) {
  if (e.key !== 'Enter' || e.isComposing) return
  e.preventDefault()
  void handleSubmit()
}
</script>

<template>
  <AppModal
      :open="open"
      :title="dialogTitle"
      :subtitle="dialogSubtitle"
      width="420px"
      @close="close"
  >
    <form v-if="showLocalForm" class="modal-form" @submit.prevent="handleSubmit">
      <FormField :label="t('auth.usernameLabel')" input-id="login-dialog-username" :error="errors.userName">
        <template #default="{ id }">
          <DwInput
              :id="id"
              v-model="form.userName"
              type="text"
              autocomplete="username"
              :placeholder="t('auth.usernamePlaceholder')"
              @keydown="onFormKeydown"
          />
        </template>
      </FormField>

      <FormField :label="t('auth.passwordLabel')" input-id="login-dialog-password" :error="errors.userPassword">
        <template #default="{ id }">
          <DwSecretInput
              :id="id"
              v-model="form.userPassword"
              autocomplete="current-password"
              :placeholder="t('auth.passwordPlaceholder')"
              @keydown="onFormKeydown"
          />
        </template>
      </FormField>

      <template v-if="isRegister && tenantCreateEnabled">
        <DwCheckbox v-model="form.createTenant" :label="t('auth.createTenantLabel')"/>
        <FormField
            v-if="form.createTenant"
            :label="t('auth.tenantNameLabel')"
            input-id="login-dialog-tenant"
            :error="errors.tenantName"
        >
          <template #default="{ id }">
            <DwInput
                :id="id"
                v-model="form.tenantName"
                :placeholder="t('auth.tenantNamePlaceholder')"
                @keydown="onFormKeydown"
            />
          </template>
        </FormField>
      </template>

      <DwInlineAlert :message="errors.form"/>
      <p v-if="isDev && !isRegister" class="modal-body-hint">{{ t('auth.defaultHint') }}</p>
      <button
          v-if="registrationEnabled"
          type="button"
          class="mode-toggle"
          @click="toggleMode"
      >
        {{ isRegister ? t('auth.switchToLogin') : t('auth.switchToRegister') }}
      </button>
      <!-- Footer ModalActions is outside <form>; keep a submit control for native Enter. -->
      <button type="submit" class="login-dialog-submit-sr" tabindex="-1">
        {{ isRegister ? t('auth.registerSubmit') : t('auth.submit') }}
      </button>
    </form>

    <div v-if="oidcEnabled && !isRegister" class="oidc-block">
      <p v-if="!showLocalForm" class="modal-body-hint">{{ t('auth.oidcOnlyHint') }}</p>
      <DwButton variant="secondary" class="oidc-btn" @click="startOidcLogin">
        {{ t('auth.oidcLogin') }}
      </DwButton>
    </div>

    <template v-if="showLocalForm" #footer>
      <ModalActions
          :confirm-label="loading ? '…' : (isRegister ? t('auth.registerSubmit') : t('auth.submit'))"
          :cancel-label="t('common.cancel')"
          :confirm-disabled="loading"
          @cancel="close"
          @confirm="handleSubmit"
      />
    </template>
  </AppModal>
</template>

<style scoped>
.oidc-block {
  margin-top: 12px;
}
.oidc-btn {
  width: 100%;
}
.mode-toggle {
  margin-top: 10px;
  border: none;
  background: transparent;
  color: var(--dw-primary);
  font-size: var(--dw-text-sm);
  cursor: pointer;
  padding: 0;
}
.mode-toggle:hover {
  text-decoration: underline;
}
.login-dialog-submit-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
