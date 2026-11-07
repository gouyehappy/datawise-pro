export const shortcutFiles = import.meta.glob('../shortcuts-config/*.txt', {
    eager: true,
    query: '?raw',
    import: 'default',
}) as Record<string, string>
