import {inject} from 'vue'
import {DW_TOAST} from '@datawise/theme'
import {createToastController, type ToastController} from './createToastController'

let fallback: ToastController | null = null

function getFallback(): ToastController {
  if (!fallback) fallback = createToastController()
  return fallback
}

/** inject(DW_TOAST) or module-level fallback controller. */
export function useDwToast(): ToastController {
  return inject<ToastController | undefined>(DW_TOAST, undefined) ?? getFallback()
}
