import { DirectMemo, IndirectMemo, Normal, RefreshButton } from './components';

export const dynamic = 'force-dynamic';

export default function Page() {
  const serverRender = `${Date.now()}-${Math.random()}`;

  return (
    <main>
      <p id="server-render">{serverRender}</p>
      <RefreshButton />
      <Normal />
      <DirectMemo />
      <IndirectMemo />
    </main>
  );
}
