import isOdd from '@repro/git-dependency'

export default function Page() {
  return <main>{isOdd(3) ? 'dependency loaded' : 'unexpected result'}</main>
}
