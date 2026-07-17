import type { Route } from 'next'
import Link from 'next/link'

type Page = {
  number: number
  first: boolean
  last: boolean
}

type Props<T extends string> = {
  page: Page
  hrefForPage(page: string): Route<T> | URL
}

export function Pager<T extends string>({ page, hrefForPage }: Props<T>) {
  const prevPage = `${page.number - 1}`
  const nextPage = `${page.number + 1}`

  return (
    <nav>
      <Link href={hrefForPage(prevPage)}>prev</Link>
      <Link href={hrefForPage(nextPage)}>next</Link>
    </nav>
  )
}
