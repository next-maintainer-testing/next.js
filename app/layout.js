import { Geist, Geist_Mono } from 'next/font/google'

const sans = Geist({ subsets: ['latin'] })
const mono = Geist_Mono({ subsets: ['latin'] })

export default function Layout({ children }) {
  return <html lang="en"><body className={`${sans.className} ${mono.className}`}>{children}</body></html>
}
