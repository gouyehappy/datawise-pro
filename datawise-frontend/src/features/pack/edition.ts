/** Build-time edition flag for Standard vs full (AI included) frontend. */

export function isStandardEdition(): boolean {
    return import.meta.env?.VITE_DATAWISE_EDITION === 'standard'
}

export function isFullEdition(): boolean {
    return !isStandardEdition()
}
