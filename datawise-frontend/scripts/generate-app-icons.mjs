/**
 * Rasterize brand SVGs → build/* & public/* at maximum practical resolution.
 */
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import sharp from 'sharp'
import toIco from 'to-ico'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const brandLogoSvg = readFileSync(join(root, 'src/assets/brand-logo.svg'))
const brandTraySvg = readFileSync(join(root, 'src/assets/brand-tray.svg'))

/** Master PNG for desktop packaging (Windows scales down from this). */
const MASTER_ICON_SIZE = 4096

/** SVG render density — higher = sharper small-size downscales. */
function svgDensity(targetPx) {
    return Math.max(512, Math.ceil((targetPx / 32) * 144))
}

async function renderPng(svg, size, {supersample = false} = {}) {
    const renderPx = supersample && size <= 128 ? size * 2 : size
    let pipeline = sharp(svg, {density: svgDensity(renderPx)}).resize(renderPx, renderPx, {
        kernel: sharp.kernel.lanczos3,
        fit: 'fill',
    })
    if (renderPx !== size) {
        pipeline = pipeline.resize(size, size, {kernel: sharp.kernel.lanczos3, fit: 'fill'})
    }
    return pipeline
        .png({compressionLevel: 9, effort: 10, palette: false})
        .toBuffer()
}

async function writePng(svg, out, size, options = {}) {
    mkdirSync(dirname(out), {recursive: true})
    const buffer = await renderPng(svg, size, options)
    writeFileSync(out, buffer)
    console.log(`wrote ${out} (${size}×${size})`)
    return buffer
}

const buildTargets = [
    {svg: brandLogoSvg, out: join(root, 'build/icon.png'), size: MASTER_ICON_SIZE},
    {svg: brandTraySvg, out: join(root, 'build/tray-icon.png'), size: 256, supersample: true},
]

const publicTargets = [
    {svg: brandLogoSvg, out: join(root, 'public/favicon-16.png'), size: 16, supersample: true},
    {svg: brandLogoSvg, out: join(root, 'public/favicon-32.png'), size: 32, supersample: true},
    {svg: brandLogoSvg, out: join(root, 'public/favicon-48.png'), size: 48, supersample: true},
    {svg: brandLogoSvg, out: join(root, 'public/favicon-64.png'), size: 64, supersample: true},
    {svg: brandLogoSvg, out: join(root, 'public/favicon-128.png'), size: 128},
    {svg: brandLogoSvg, out: join(root, 'public/favicon-256.png'), size: 256},
    {svg: brandLogoSvg, out: join(root, 'public/favicon.png'), size: 128},
    {svg: brandLogoSvg, out: join(root, 'public/apple-touch-icon.png'), size: 180},
    {svg: brandLogoSvg, out: join(root, 'public/icon-192.png'), size: 192},
    {svg: brandLogoSvg, out: join(root, 'public/icon-512.png'), size: 512},
]

for (const target of buildTargets) {
    await writePng(target.svg, target.out, target.size, {supersample: target.supersample})
}

for (const target of publicTargets) {
    await writePng(target.svg, target.out, target.size, {supersample: target.supersample})
}

const icoSizes = [16, 24, 32, 48, 64, 128, 256]
const icoBuffers = await Promise.all(
    icoSizes.map(async (size) => renderPng(brandLogoSvg, size, {supersample: size <= 48})),
)
const icoPath = join(root, 'build/icon.ico')
writeFileSync(icoPath, await toIco(icoBuffers))
console.log(`wrote ${icoPath} (${icoSizes.join(', ')}px)`)

/** NSIS wizard artwork (24-bit BMP). */
const installerSidebarSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="164" height="314" viewBox="0 0 164 314">
  <defs>
    <linearGradient id="bg" x1="82" y1="0" x2="82" y2="314" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#6d72f8"/>
      <stop offset="55%" stop-color="#5248e8"/>
      <stop offset="100%" stop-color="#3b2fc9"/>
    </linearGradient>
    <linearGradient id="glow" x1="30" y1="40" x2="130" y2="280" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#a5f3fc" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#34d399" stop-opacity="0.12"/>
    </linearGradient>
    <filter id="blur" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="18"/>
    </filter>
  </defs>
  <rect width="164" height="314" fill="url(#bg)"/>
  <circle cx="28" cy="52" r="42" fill="#a5f3fc" opacity="0.18" filter="url(#blur)"/>
  <circle cx="138" cy="250" r="48" fill="#34d399" opacity="0.14" filter="url(#blur)"/>
  <rect x="0" y="0" width="164" height="314" fill="url(#glow)"/>
  <g transform="translate(50 78)">
    <circle cx="32" cy="32" r="32" fill="#ffffff" fill-opacity="0.12"/>
    <circle cx="32" cy="32" r="26" fill="#ffffff" fill-opacity="0.08"/>
  </g>
  <text x="82" y="168" text-anchor="middle" fill="#ffffff" font-family="Segoe UI, Arial, sans-serif" font-size="15" font-weight="700">DataWise</text>
  <text x="82" y="188" text-anchor="middle" fill="#e9d5ff" font-family="Segoe UI, Arial, sans-serif" font-size="12" font-weight="600">CLI</text>
  <text x="82" y="228" text-anchor="middle" fill="#c7d2fe" font-family="Segoe UI, Arial, sans-serif" font-size="9.5" font-weight="500">本地数据库工作台</text>
  <text x="82" y="246" text-anchor="middle" fill="#a5b4fc" font-family="Segoe UI, Arial, sans-serif" font-size="8.5" font-weight="500">连接 · 查询 · 分析 · 导出</text>
  <rect x="44" y="268" width="76" height="3" rx="1.5" fill="#ffffff" fill-opacity="0.22"/>
  <rect x="44" y="268" width="48" height="3" rx="1.5" fill="#a5f3fc" fill-opacity="0.85"/>
</svg>
`

const installerHeaderSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="150" height="57" viewBox="0 0 150 57">
  <defs>
    <linearGradient id="hdr" x1="0" y1="0" x2="150" y2="57" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#6d72f8"/>
      <stop offset="100%" stop-color="#5248e8"/>
    </linearGradient>
  </defs>
  <rect width="150" height="57" fill="url(#hdr)"/>
  <circle cx="118" cy="28" r="22" fill="#ffffff" fill-opacity="0.1"/>
  <text x="14" y="24" fill="#ffffff" font-family="Segoe UI, Arial, sans-serif" font-size="13" font-weight="700">DataWise CLI</text>
  <text x="14" y="42" fill="#dbeafe" font-family="Segoe UI, Arial, sans-serif" font-size="9.5" font-weight="500">数据库桌面客户端</text>
</svg>
`

async function writeBmp(svg, out, width, height) {
    mkdirSync(dirname(out), {recursive: true})
    const {data} = await sharp(Buffer.from(svg))
        .resize(width, height, {fit: 'fill'})
        .removeAlpha()
        .raw()
        .toBuffer({resolveWithObject: true})

    const rowSize = Math.ceil((width * 3) / 4) * 4
    const imageSize = rowSize * height
    const fileSize = 54 + imageSize
    const header = Buffer.alloc(54)
    header.write('BM')
    header.writeUInt32LE(fileSize, 2)
    header.writeUInt32LE(0, 6)
    header.writeUInt32LE(54, 10)
    header.writeUInt32LE(40, 14)
    header.writeInt32LE(width, 18)
    header.writeInt32LE(height, 22)
    header.writeUInt16LE(1, 26)
    header.writeUInt16LE(24, 28)
    header.writeUInt32LE(imageSize, 34)

    const pixels = Buffer.alloc(imageSize)
    for (let y = 0; y < height; y += 1) {
        const srcY = height - 1 - y
        for (let x = 0; x < width; x += 1) {
            const srcIdx = (srcY * width + x) * 3
            const dstIdx = y * rowSize + x * 3
            pixels[dstIdx] = data[srcIdx + 2]
            pixels[dstIdx + 1] = data[srcIdx + 1]
            pixels[dstIdx + 2] = data[srcIdx]
        }
    }

    writeFileSync(out, Buffer.concat([header, pixels]))
    console.log(`wrote ${out} (${width}×${height} BMP)`)
}

await writeBmp(installerSidebarSvg, join(root, 'build/installer-sidebar.bmp'), 164, 314)
await writeBmp(installerHeaderSvg, join(root, 'build/installer-header.bmp'), 150, 57)
