export const metadata = {
  title: 'http-equiv metadata reproduction',
  httpEquiv: {
    refresh: '5; URL="https://example.com/destination"',
  },
}

export default function Page() {
  return <main id="issue-54437-marker">Issue 54437 reproduction</main>
}
