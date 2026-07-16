export function GET() {
  return new Response('upstream response', {
    headers: {
      'x-existing-header': 'upstream-original',
      'x-remove-header': 'upstream-remove',
    },
  })
}
