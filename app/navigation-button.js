import Link from 'next/link'

export default function NavigationButton({ href, children }) {
  return (
    <Link data-testid="navigate" href={href}>
      {children}
    </Link>
  )
}
