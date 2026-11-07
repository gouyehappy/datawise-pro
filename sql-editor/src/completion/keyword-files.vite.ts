export const keywordFiles = import.meta.glob('../keywords-config/*.txt', {
    eager: true,
    query: '?raw',
    import: 'default',
}) as Record<string, string>
