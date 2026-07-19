import localFont from '@next/font/local'

const inter = localFont({
  src: '../public/Inter.woff2',
  weight: '100 900',
  fallback: ['serif'],
})

export default function Home() {
  return <main><span id="font-target" className={inter.className}>WWWWMMMMiiii1111</span></main>
}
