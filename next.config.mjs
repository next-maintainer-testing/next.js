import { copyFile, mkdir, writeFile } from 'node:fs/promises'

const outputDir = new URL('./.next/', import.meta.url)

export default {
  async runAfterProductionCompile() {
    await mkdir(outputDir, { recursive: true })
    await writeFile(new URL('after-production-compile.txt', outputDir), 'called\n')
  },
  async runAfterStaticPageGeneration() {
    await mkdir(outputDir, { recursive: true })
    await copyFile(
      new URL('./copy-source.txt', import.meta.url),
      new URL('copied-after-static-generation.txt', outputDir)
    )
  },
}
