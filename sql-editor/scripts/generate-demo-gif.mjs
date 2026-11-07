/**
 * 从 docs/demo-scene.html 生成 README 演示动图
 * 运行: npm run gen:demo-gif
 */
import gifenc from 'gifenc'
import {PNG} from 'pngjs'
import {createWriteStream} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import puppeteer from 'puppeteer'

const {GIFEncoder, quantize, applyPalette} = gifenc

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const scenePath = join(root, 'docs', 'demo-scene.html')
const outPath = join(root, 'docs', 'demo.gif')

const FRAME_MS = 165
const PALETTE_SIZE = 128
const CLIP = {x: 0, y: 0, width: 960, height: 600}

/** 每帧停留次数（越大越慢） */
const TIMELINE = [
    {index: 0, hold: 7},
    {index: 1, hold: 8},
    {index: 2, hold: 8},
    {index: 3, hold: 9},
    {index: 4, hold: 9},
    {index: 5, hold: 9},
    {index: 6, hold: 10},
    {index: 7, hold: 10},
    {index: 8, hold: 9},
    {index: 9, hold: 9},
    {index: 10, hold: 10},
    {index: 11, hold: 9},
    {index: 12, hold: 10},
    {index: 13, hold: 10},
    {index: 14, hold: 9},
    {index: 15, hold: 12},
]

function buildSceneIndices(timeline) {
    const indices = []
    for (const {index, hold} of timeline) {
        for (let r = 0; r < hold; r++) indices.push(index)
    }
    return indices
}

async function captureFrames(page, sceneIndices) {
    const pngBuffers = []
    for (const index of sceneIndices) {
        await page.evaluate((i) => window.renderFrame(i), index)
        await new Promise((r) => setTimeout(r, 80))
        pngBuffers.push(await page.screenshot({type: 'png', clip: CLIP}))
    }
    return pngBuffers
}

function pngToRgba(buffer) {
    const png = PNG.sync.read(buffer)
    return {width: png.width, height: png.height, rgba: png.data}
}

function writeGif(pngBuffers, outFile) {
    const gif = GIFEncoder()
    for (const buf of pngBuffers) {
        const {width, height, rgba} = pngToRgba(buf)
        const palette = quantize(rgba, PALETTE_SIZE)
        const index = applyPalette(rgba, palette)
        gif.writeFrame(index, width, height, {
            palette,
            delay: FRAME_MS,
            repeat: 0,
            transparent: false,
            dispose: 2,
        })
    }
    gif.finish()
    const bytes = gif.bytes()
    createWriteStream(outFile).end(Buffer.from(bytes))
    return bytes.length
}

async function main() {
    const sceneIndices = buildSceneIndices(TIMELINE)
    const browser = await puppeteer.launch({headless: true, defaultViewport: {width: 960, height: 600}})
    const page = await browser.newPage()
    await page.goto(pathToFileURL(scenePath).href, {waitUntil: 'networkidle0'})

    const pngBuffers = await captureFrames(page, sceneIndices)
    await browser.close()

    const size = writeGif(pngBuffers, outPath)
    console.log(`Wrote ${outPath} (${Math.round(size / 1024)} KB, ${pngBuffers.length} frames @ ${FRAME_MS}ms)`)
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
