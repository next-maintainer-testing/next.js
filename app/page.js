export default function Page() {
  const value = process.env.NEXT_PUBLIC_API_URL || "Can't get Env"
  const status = value === "Can't get Env" ? 'missing' : 'loaded'

  return <main data-env-status={status}>{value}</main>
}
