import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))
const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc')
const result = spawnSync(process.execPath, [tsc, '--project', 'tsconfig.json', '--pretty', 'false'], {
  cwd: root,
  encoding: 'utf8',
  timeout: 240_000,
})

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
const symptom = /components\/client\.tsx\(11,28\): error TS2344: Type 'PageParams' does not satisfy the constraint 'Params'\.[\s\S]*Index signature for type 'string' is missing in type 'PageParams'\./.test(output)

if (symptom) {
  console.log('Reproduced: useParams<PageParams>() rejects an interface without a string index signature.')
  console.log(output.trim())
  process.exitCode = 0
} else if (result.error) {
  console.error(`Check failed: ${result.error.message}`)
  process.exitCode = 2
} else if (result.status === 0) {
  console.log('Not reproduced: the interface is accepted by useParams<PageParams>().')
  process.exitCode = 1
} else {
  console.error('Check failed with unexpected TypeScript diagnostics:')
  console.error(output.trim())
  process.exitCode = 2
}
