import { Open_Sans } from 'next/font/google'
import localFont from 'next/font/local'

const googleOpenSans = Open_Sans({
  subsets: ['latin'],
  weight: '400',
  variable: '--google-open-sans',
  display: 'block',
})

const localOpenSans = localFont({
  src: '../fonts/OpenSans-Regular.ttf',
  weight: '400',
  variable: '--local-open-sans',
  display: 'block',
})

export default function Home() {
  return (
    <main className={`${googleOpenSans.variable} ${localOpenSans.variable}`}>
      <p id="google" className="sample google">Hamburgefontsiv Open Sans 400</p>
      <p id="local" className="sample local">Hamburgefontsiv Open Sans 400</p>
      <style jsx>{`
        main { background: white; color: black; padding: 24px; }
        .sample { margin: 0 0 24px; font-size: 16px; font-weight: 400; line-height: 1; }
        .google { font-family: var(--google-open-sans); }
        .local { font-family: var(--local-open-sans); }
      `}</style>
    </main>
  )
}
