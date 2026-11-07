/** True when the Vite build set VITE_DATAWISE_EDITION=standard (paid UI stubbed out). */
export function isStandardEdition(): boolean {
    return import.meta.env?.VITE_DATAWISE_EDITION === 'standard'
}

