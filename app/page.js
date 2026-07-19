class ModuleScopedService {
  constructor() {
    this.value = 'module-scope-introspection-works'
  }

  read() {
    return this.value
  }
}

const service = new ModuleScopedService()

async function readModuleScopedService() {
  'use cache'
  return service.read()
}

export default async function Page() {
  const result = await readModuleScopedService()
  return <main id="result">{result}</main>
}
