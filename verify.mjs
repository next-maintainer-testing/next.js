import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

try {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const { GoogleMapsEmbed } = require('@next/third-parties/google')

  const origin = 'Brooklyn+Bridge,New+York,NY'
  const destination = 'Paris,France'
  const html = renderToStaticMarkup(
    React.createElement(GoogleMapsEmbed, {
      apiKey: 'TEST_KEY',
      height: 200,
      width: '100%',
      mode: 'directions',
      origin,
      destination,
    })
  )

  const srcMatch = html.match(/<iframe[^>]*\ssrc="([^"]+)"/)
  if (!srcMatch) {
    throw new Error(`GoogleMapsEmbed did not render an iframe: ${html}`)
  }

  const src = srcMatch[1].replaceAll('&amp;', '&')
  const url = new URL(src)
  if (!url.pathname.endsWith('/embed/v1/directions')) {
    throw new Error(`GoogleMapsEmbed rendered an unexpected directions URL: ${src}`)
  }

  const missing = []
  if (url.searchParams.get('origin') !== origin) missing.push('origin')
  if (url.searchParams.get('destination') !== destination) missing.push('destination')

  if (missing.length > 0) {
    console.log(
      `BUG: directions iframe URL omits required ${missing.join(' and ')} query parameter(s): ${src}`
    )
    process.exitCode = 0
  } else {
    console.log(`FIXED: directions iframe URL includes origin and destination: ${src}`)
    process.exitCode = 1
  }
} catch (error) {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 2
}
