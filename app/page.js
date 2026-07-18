import { createWrapper } from 'next-redux-wrapper';

// Importing next-redux-wrapper from an App Router Server Component loads
// next/router, matching the stack reported in the issue.
const wrapperLoaded = typeof createWrapper === 'function';

export default function Page() {
  return <main>Wrapper loaded: {String(wrapperLoaded)}</main>;
}
