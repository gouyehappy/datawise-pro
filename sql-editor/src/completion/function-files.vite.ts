export const functionFiles = import.meta.glob('../functions-config/*.txt', {
    eager: true,
    query: '?raw',
    import: 'default',
}) as Record<string, string>
