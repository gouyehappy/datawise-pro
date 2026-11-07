import {onBeforeUnmount, onMounted, ref, type Ref} from 'vue'
import {keybindingEntryKey, normalizeKeyChord} from '@sql-editor/editor/shortcut-config'
import {keyboardEventToKeyChord, previewKeyChordFromEvent} from '@sql-editor/editor/chord-from-event'
import type {SqlKeybindingConfig} from '@sql-editor/types'

export interface KeybindingRecorderOptions {
    keybindings: Ref<readonly SqlKeybindingConfig[]>
    isKeybindingEnabled: (binding: SqlKeybindingConfig) => boolean
    updateKeybindingKeys: (binding: SqlKeybindingConfig, keys: string) => boolean
    invalidMessage: string
    listenMessage: string
}

/** 快捷键 chord 录制：全局 capture 监听 + 冲突校验。 */
export function useKeybindingRecorder(options: KeybindingRecorderOptions) {
    const recordingEntryKey = ref<string | null>(null)
    const recordingPreview = ref('')
    const keybindingError = ref('')

    function stopRecording() {
        recordingEntryKey.value = null
        recordingPreview.value = ''
        keybindingError.value = ''
    }

    function isRecordingBinding(binding: SqlKeybindingConfig): boolean {
        return recordingEntryKey.value === keybindingEntryKey(binding)
    }

    function startRecording(binding: SqlKeybindingConfig) {
        if (!options.isKeybindingEnabled(binding)) return
        keybindingError.value = ''
        recordingEntryKey.value = keybindingEntryKey(binding)
        recordingPreview.value = ''
    }

    function onRecordKeydown(event: KeyboardEvent) {
        if (!recordingEntryKey.value) return

        if (event.key === 'Escape') {
            event.preventDefault()
            stopRecording()
            return
        }

        recordingPreview.value = previewKeyChordFromEvent(event) || options.listenMessage

        const chord = keyboardEventToKeyChord(event)
        if (!chord) return

        event.preventDefault()
        event.stopPropagation()

        const binding = options.keybindings.value.find(
            (item) => keybindingEntryKey(item) === recordingEntryKey.value,
        )
        if (!binding) {
            stopRecording()
            return
        }

        if (chord === normalizeKeyChord(binding.keys)) {
            stopRecording()
            return
        }

        const ok = options.updateKeybindingKeys(binding, chord)
        if (!ok) {
            keybindingError.value = options.invalidMessage
            return
        }
        stopRecording()
    }

    function keyDisplay(binding: SqlKeybindingConfig): string {
        if (isRecordingBinding(binding)) {
            return recordingPreview.value || options.listenMessage
        }
        return binding.keys
    }

    onMounted(() => {
        window.addEventListener('keydown', onRecordKeydown, true)
    })
    onBeforeUnmount(() => {
        window.removeEventListener('keydown', onRecordKeydown, true)
    })

    return {
        recordingEntryKey,
        keybindingError,
        stopRecording,
        isRecordingBinding,
        startRecording,
        keyDisplay,
    }
}
