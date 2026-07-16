export default async function Page() {
  const filePath = 'post/ignored.mp4'
  let excludedFileWasImported = false

  try {
    await import(/* webpackExclude: /\.mp4$/ */ `../content/${filePath}`)
    excludedFileWasImported = true
  } catch (error) {
    if (!String(error).includes('Cannot find module')) throw error
  }

  return (
    <main id="result">
      {excludedFileWasImported ? 'BUG: excluded mp4 was imported' : 'OK: mp4 was excluded'}
    </main>
  )
}
