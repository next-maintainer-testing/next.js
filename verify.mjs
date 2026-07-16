import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import freetype from '@julusian/freetype2'
import { decompress } from 'wawoff2'

function checkFailed(message) {
  console.error(`CHECK_FAILED: ${message}`)
  process.exitCode = 2
}

try {
  const build = spawnSync(process.execPath, ['./node_modules/next/dist/bin/next', 'build'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 180000,
  })
  process.stdout.write(build.stdout || '')
  process.stderr.write(build.stderr || '')
  if (build.error || build.status !== 0) throw new Error(`next build failed (${build.error?.message || build.status})`)

  const sample = 'HEF128quickbrownfoxjumpslazydog'
  const mediaDir = join(process.cwd(), '.next', 'static', 'media')
  const candidates = []
  for (const filename of readdirSync(mediaDir).filter(name => name.endsWith('.woff2'))) {
    try {
      const sfnt = Buffer.from(await decompress(readFileSync(join(mediaDir, filename))))
      const face = freetype.NewMemoryFace(sfnt)
      const properties = face.properties()
      if (properties.familyName === 'NanumGothicCoding' &&
          [...sample].every(char => (face.getCharIndex(char.codePointAt(0)) || 0) > 0)) {
        candidates.push({ filename, sfnt, glyphs: properties.numGlyphs })
      }
    } catch {}
  }
  if (!candidates.length) throw new Error('could not locate the generated next/font Latin subset')
  candidates.sort((a, b) => Number(!a.filename.includes('.p.')) - Number(!b.filename.includes('.p.')) || a.glyphs - b.glyphs)

  const optimized = freetype.NewMemoryFace(candidates[0].sfnt)
  const reference = freetype.NewFace(join(process.cwd(), 'public', 'NanumGothicCoding-Bold.ttf'))
  let compared = 0
  let changed = 0
  let totalDelta = 0
  let metricChanges = 0

  for (const size of [10, 11, 12, 13, 14, 16, 20, 26]) {
    optimized.setPixelSizes(0, size)
    reference.setPixelSizes(0, size)
    for (const char of sample) {
      const expected = reference.loadChar(char.codePointAt(0), { render: true })
      const actual = optimized.loadChar(char.codePointAt(0), { render: true })
      const expectedBitmap = expected.bitmap
      const actualBitmap = actual.bitmap
      if (!expectedBitmap || !actualBitmap) throw new Error(`FreeType did not render ${char}`)

      if (expectedBitmap.width !== actualBitmap.width || expectedBitmap.height !== actualBitmap.height ||
          expected.bitmapLeft !== actual.bitmapLeft || expected.bitmapTop !== actual.bitmapTop ||
          expected.metrics.horiAdvance !== actual.metrics.horiAdvance) metricChanges++

      const length = Math.max(expectedBitmap.buffer.length, actualBitmap.buffer.length)
      for (let i = 0; i < length; i++) {
        const delta = Math.abs((expectedBitmap.buffer[i] || 0) - (actualBitmap.buffer[i] || 0))
        totalDelta += delta
        compared++
        if (delta > 8) changed++
      }
    }
  }

  const changedRatio = changed / compared
  const meanDelta = totalDelta / compared
  console.log(`GENERATED_FONT=${candidates[0].filename}`)
  console.log(`FREETYPE_RENDER_COMPARISON bytes=${compared} changed=${changed} changedRatio=${changedRatio.toFixed(4)} meanDelta=${meanDelta.toFixed(2)} metricChanges=${metricChanges}`)

  const symptomPresent = changedRatio > 0.08 && meanDelta > 10
  process.exitCode = symptomPresent ? 0 : 1
  console.log(symptomPresent
    ? 'SYMPTOM_PRESENT: hinted FreeType rendering of next/font output substantially differs from the original TTF'
    : 'SYMPTOM_ABSENT: hinted FreeType rendering of next/font output matches the original TTF')
} catch (error) {
  checkFailed(error?.stack || String(error))
}
