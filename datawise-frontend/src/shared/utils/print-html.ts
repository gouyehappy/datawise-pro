/**
 * Open an HTML document in a new window and invoke the browser print dialog
 * so users can Save as PDF with full Unicode (CJK) support — no font embedding.
 */
export function openHtmlPrintDialog(html: string): boolean {
    if (typeof window === 'undefined' || typeof document === 'undefined') return false
    const popup = window.open('', '_blank')
    if (!popup) return false
    try {
        popup.document.open()
        popup.document.write(html)
        popup.document.close()
        popup.focus()
        // Defer so layout/fonts settle before the print dialog.
        window.setTimeout(() => {
            try {
                popup.print()
            } catch {
                // Ignore; user can still print manually from the preview window.
            }
        }, 250)
        return true
    } catch {
        try {
            popup.close()
        } catch {
            // ignore
        }
        return false
    }
}
