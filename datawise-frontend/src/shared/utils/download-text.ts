/** Shared text-file download helpers (host must not import features/ai for these). */

export function downloadTextFile(content: string, filename: string, mimeType: string) {
    const blob = new Blob([content], {type: mimeType})
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    URL.revokeObjectURL(url)
}

/** Browsers often block multiple downloads in one tick — stagger saves. */
export function downloadTextFilesSequentially(
    files: Array<{content: string; filename: string; mimeType: string}>,
    delayMs = 400,
) {
    files.forEach((file, index) => {
        window.setTimeout(
            () => downloadTextFile(file.content, file.filename, file.mimeType),
            index * delayMs,
        )
    })
}
