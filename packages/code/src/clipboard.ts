import {inject} from 'vue'
import {DW_CLIPBOARD} from '@datawise/theme'

export type DwClipboardFace = {
  writeText: (text: string) => Promise<void>
  readText?: () => Promise<string>
}

async function navigatorWriteText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Prefer inject(DW_CLIPBOARD); fall back to navigator.clipboard. */
export function useCodeClipboard(): {
  writeText: (text: string) => Promise<boolean>
} {
  const injected = inject<DwClipboardFace | undefined>(DW_CLIPBOARD, undefined)
  return {
    async writeText(text: string) {
      if (injected?.writeText) {
        try {
          await injected.writeText(text)
          return true
        } catch {
          return false
        }
      }
      return navigatorWriteText(text)
    },
  }
}
