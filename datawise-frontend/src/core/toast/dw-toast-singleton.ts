import {createToastController, type ToastController} from '@datawise/overlays'

let controller: ToastController | null = null

/** One shared toast controller for the DataWise host (Pinia facade + DW_TOAST inject). */
export function getDwToastController(): ToastController {
  if (!controller) {
    controller = createToastController()
  }
  return controller
}
