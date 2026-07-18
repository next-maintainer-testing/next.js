import localFont from 'next/font/local'

const local = localFont({
  src: '../fonts/local.ttf',
  variable: '--font-local',
})

export default function FrontendLayout({ children }) {
  return (
    <html lang="en" className={local.variable}>
      <body>{children}</body>
    </html>
  )
}
