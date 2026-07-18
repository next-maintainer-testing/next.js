import localFont from 'next/font/local'

const ExampleFont = localFont({
  src: [
    { path: '../fonts/example.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/example.woff', weight: '400', style: 'normal' },
  ],
})

export default function Home() {
  return <main className={ExampleFont.className}>Local font preload reproduction</main>
}
