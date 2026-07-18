import { rm, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const projectDir = new URL('.', import.meta.url).pathname

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await filesUnder(path))
    else files.push(path)
  }
  return files
}

function runBuild() {
  return new Promise((resolve) => {
    const child = spawn('npm', ['run', 'build'], {
      cwd: projectDir,
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: '1',
        NODE_OPTIONS: [process.env.NODE_OPTIONS, '--openssl-legacy-provider'].filter(Boolean).join(' '),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', (chunk) => { output += chunk })
    child.stderr.on('data', (chunk) => { output += chunk })
    child.on('error', (error) => resolve({ code: null, output: `${output}\n${error.stack}` }))
    child.on('close', (code) => resolve({ code, output }))
  })
}

let result = 2
try {
  await rm(join(projectDir, '.next'), { recursive: true, force: true })
  const build = await runBuild()

  if (build.code !== 0) {
    if (build.output.includes('@import rules must precede all rules') && build.output.includes('styles/globals.css')) {
      console.log('SYMPTOM PRESENT: the compiler rejects the reported global CSS instead of preserving the remote import separately.')
      result = 0
    } else {
      console.error('CHECK FAILED: Next.js build did not complete for an unrelated reason.')
      console.error(build.output.slice(-4000))
      result = 2
    }
  } else {
    const cssDirectory = join(projectDir, '.next', 'static', 'css')
    const cssFiles = (await filesUnder(cssDirectory)).filter((file) => file.endsWith('.css'))
    const stylesheets = await Promise.all(cssFiles.map(async (file) => ({ file, css: await readFile(file, 'utf8') })))
    const appStylesheet = stylesheets.find(({ css }) => css.includes('#repro-content'))

    if (!appStylesheet) {
      console.error('CHECK FAILED: could not locate the emitted stylesheet containing the reproduction marker.')
      result = 2
    } else {
      const css = appStylesheet.css
      const importIndex = css.indexOf('fonts.googleapis.com/css2?family=Abril+Fatface')
      const precedingRuleIndex = css.search(/(?:\*|:where\(\*\))\s*\{[^}]*font-family\s*:\s*(?:["']?Abril Fatface|Abril)/i)

      if (precedingRuleIndex < 0) {
        console.error('CHECK FAILED: the emitted stylesheet did not contain the preceding font-family rule.')
        result = 2
      } else if (importIndex < 0) {
        console.log('SYMPTOM PRESENT: the emitted app stylesheet dropped the reported remote @import.')
        result = 0
      } else if (precedingRuleIndex < importIndex) {
        console.log('SYMPTOM PRESENT: the emitted app stylesheet places the remote @import after an ordinary rule, so browsers ignore it.')
        result = 0
      } else {
        console.log('SYMPTOM ABSENT: the remote @import precedes ordinary rules in the emitted stylesheet.')
        result = 1
      }
    }
  }
} catch (error) {
  console.error('CHECK FAILED:', error.stack || error)
  result = 2
}

process.exitCode = result
