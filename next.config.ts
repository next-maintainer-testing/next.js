import { loadEnvConfig } from '@next/env'

const { loadedEnvFiles } = loadEnvConfig('./env/dev')
console.log(`ISSUE_77178_LOADED_ENV_FILES=${JSON.stringify(loadedEnvFiles.map(({ path, contents }) => ({ path, contents })))}`)

export default {}
