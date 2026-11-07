/**
 * Fail fast when an npm script is bound to a specific OS but runs elsewhere.
 *
 * Usage: node require-os.mjs darwin|linux|win32
 */
const want = process.argv[2]
const labels = {darwin: 'macOS', linux: 'Linux', win32: 'Windows'}
if (!want || !labels[want]) {
    console.error(`Usage: node require-os.mjs ${Object.keys(labels).join('|')}`)
    process.exit(2)
}
if (process.platform !== want) {
    console.error(
        `This script requires ${labels[want]} (got ${labels[process.platform] || process.platform}). ` +
            `Use dist:desktop on the target OS, or cross-build from CI.`,
    )
    process.exit(1)
}
