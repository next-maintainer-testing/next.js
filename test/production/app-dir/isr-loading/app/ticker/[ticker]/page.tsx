import { existsSync, watch } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const dynamicParams = true
export const revalidate = 30

export function generateStaticParams() {
  return []
}

async function waitForRelease() {
  const startedPath = join(process.cwd(), '.isr-loading-started')
  const releasePath = join(process.cwd(), '.isr-loading-release')

  await writeFile(startedPath, 'started')

  if (existsSync(releasePath)) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    const watcher = watch(process.cwd(), (_event, filename) => {
      if (filename?.toString() === '.isr-loading-release') {
        watcher.close()
        resolve()
      }
    })

    watcher.on('error', (error) => {
      watcher.close()
      reject(error)
    })

    if (existsSync(releasePath)) {
      watcher.close()
      resolve()
    }
  })
}

export default async function Page({
  params,
}: {
  params: Promise<{ ticker: string }>
}) {
  const { ticker } = await params
  await waitForRelease()

  return <p>Ticker {ticker}</p>
}
