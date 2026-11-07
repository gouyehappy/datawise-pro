const FAVORITES_EXPANDED_KEY = 'datawise-explorer-favorites-expanded'

export function readFavoritesGroupExpanded(): boolean {
    try {
        return sessionStorage.getItem(FAVORITES_EXPANDED_KEY) !== '0'
    } catch {
        return true
    }
}

export function writeFavoritesGroupExpanded(expanded: boolean) {
    try {
        sessionStorage.setItem(FAVORITES_EXPANDED_KEY, expanded ? '1' : '0')
    } catch {
        // ignore quota / private mode
    }
}
