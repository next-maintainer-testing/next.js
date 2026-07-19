import { Suspense } from 'react';
import { BreaksServerRendering } from '../components/BreakingSSR';

export const dynamic = 'force-dynamic';

async function StreamedContent() {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return (
    <div>
      <h1>Hello World</h1>
      <BreaksServerRendering />
      <div>This will get rendered twice</div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <StreamedContent />
    </Suspense>
  );
}
