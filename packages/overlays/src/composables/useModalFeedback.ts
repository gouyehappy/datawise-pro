import {ref, watch, type Ref} from 'vue'

export type ModalFeedbackVariant = 'success' | 'error' | 'warning' | 'info'

export type ModalFeedback = {
  variant: ModalFeedbackVariant
  message: string
}

/**
 * In-modal action feedback. Prefer DwInlineAlert while a dialog is open;
 * toast is easy to miss under overlays.
 */
export function useModalFeedback(open?: Ref<boolean> | (() => boolean)) {
  const feedback = ref<ModalFeedback | null>(null)

  function setFeedback(variant: ModalFeedbackVariant, message: string) {
    const text = message.trim()
    if (!text) {
      feedback.value = null
      return
    }
    feedback.value = {variant, message: text}
  }

  function clearFeedback() {
    feedback.value = null
  }

  function showSuccess(message: string) {
    setFeedback('success', message)
  }

  function showError(message: string) {
    setFeedback('error', message)
  }

  function showWarning(message: string) {
    setFeedback('warning', message)
  }

  function showInfo(message: string) {
    setFeedback('info', message)
  }

  if (open) {
    watch(open, (isOpen) => {
      if (!isOpen) clearFeedback()
    })
  }

  return {
    feedback,
    setFeedback,
    clearFeedback,
    showSuccess,
    showError,
    showWarning,
    showInfo,
  }
}
