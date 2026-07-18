export default function SomeRouteLayout({
  children,
  someslot,
}: {
  children: React.ReactNode
  someslot: React.ReactNode
}) {
  return (
    <section>
      {children}
      {someslot}
    </section>
  )
}
