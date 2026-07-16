import { Nanum_Gothic_Coding } from 'next/font/google'

const optimized = Nanum_Gothic_Coding({ weight: '700', subsets: ['latin'], display: 'block' })
const sample = 'HHHHHHHH IIIIIIII EEEEEEEE FFFFFFFF 11111111 22222222 88888888\nThe quick brown fox jumps over the lazy dog.\nABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789'

export default function Page() {
  return <main>
    <div id="optimized" className={`sample ${optimized.className}`}>{sample}</div>
    <div id="reference" className="sample reference">{sample}</div>
  </main>
}
