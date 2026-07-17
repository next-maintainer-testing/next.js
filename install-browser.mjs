import { chmodSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const shellRoot = join(process.cwd(), '.cache', 'puppeteer', 'chrome-headless-shell')
const suffix = '-chrome-headless-shell-linux64.zip'
const findArchives = () => existsSync(shellRoot)
  ? readdirSync(shellRoot).filter((name) => name.endsWith(suffix)).sort()
  : []

let archives = findArchives()
if (!archives.length) {
  const download = spawnSync(process.execPath, ['node_modules/puppeteer/install.mjs'], { stdio: 'inherit' })
  if (download.status !== 0) throw new Error(`Puppeteer browser download failed with status ${download.status}`)
  archives = findArchives()
}
if (!archives.length) throw new Error('Puppeteer did not download a Chrome Headless Shell archive')

const archive = archives.at(-1)
const version = archive.slice(0, -suffix.length)
const target = join(shellRoot, `linux-${version}`)
const executable = join(target, 'chrome-headless-shell-linux64', 'chrome-headless-shell')

if (!existsSync(executable)) {
  rmSync(target, { recursive: true, force: true })
  mkdirSync(target, { recursive: true })
  const unzip = spawnSync('unzip', ['-q', join(shellRoot, archive), '-d', target], { stdio: 'inherit' })
  if (unzip.status !== 0) throw new Error(`unzip failed with status ${unzip.status}`)
}

chmodSync(executable, 0o755)
console.log(`Chrome Headless Shell ready at ${executable}`)
