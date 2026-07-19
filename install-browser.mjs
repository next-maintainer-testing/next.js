import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import puppeteer from 'puppeteer'
import { PUPPETEER_REVISIONS } from 'puppeteer-core/internal/revisions.js'

const buildId = PUPPETEER_REVISIONS['chrome-headless-shell']
const cache = puppeteer.configuration.cacheDirectory
const browserRoot = join(cache, 'chrome-headless-shell')
const archive = join(browserRoot, `${buildId}-chrome-headless-shell-linux64.zip`)
const installDirectory = join(browserRoot, `linux-${buildId}`)
export const executablePath = join(
  installDirectory,
  'chrome-headless-shell-linux64',
  'chrome-headless-shell',
)

if (!existsSync(executablePath)) {
  if (!existsSync(archive)) {
    const cli = new URL('./node_modules/.bin/puppeteer', import.meta.url).pathname
    execFileSync(cli, ['browsers', 'install', `chrome-headless-shell@${buildId}`], {
      stdio: 'inherit',
    })
  }

  // Puppeteer's archive extractor can leave a partial directory in this sandbox,
  // while the downloaded archive itself is complete. System unzip is reliable here.
  rmSync(installDirectory, { recursive: true, force: true })
  mkdirSync(installDirectory, { recursive: true })
  execFileSync('unzip', ['-q', archive, '-d', installDirectory], { stdio: 'inherit' })
}

if (!existsSync(executablePath)) {
  throw new Error(`Browser installation did not create ${executablePath}`)
}
