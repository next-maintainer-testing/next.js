import { spawnSync } from 'node:child_process'
import { createWriteStream, existsSync } from 'node:fs'
import { chmod, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const version = '137.0.7151.119'
const cache = process.env.PUPPETEER_CACHE_DIR || join(homedir(), '.cache', 'puppeteer')
const root = join(cache, 'chrome-headless-shell')
const build = join(root, `linux-${version}`)
const executable = join(build, 'chrome-headless-shell-linux64', 'chrome-headless-shell')

if (!existsSync(executable)) {
  await mkdir(root, { recursive: true })
  const archive = join(root, `${version}-chrome-headless-shell-linux64.zip`)
  if (!existsSync(archive)) {
    const url = `https://storage.googleapis.com/chrome-for-testing-public/${version}/linux64/chrome-headless-shell-linux64.zip`
    const response = await fetch(url)
    if (!response.ok || !response.body) throw new Error(`Browser download failed: ${response.status}`)
    await pipeline(Readable.fromWeb(response.body), createWriteStream(archive))
  }
  await mkdir(build, { recursive: true })
  const unpacked = spawnSync('unzip', ['-q', '-o', archive, '-d', build], { stdio: 'inherit' })
  if (unpacked.status !== 0) throw new Error(`Browser extraction failed with status ${unpacked.status}`)
  await chmod(executable, 0o755)
}
