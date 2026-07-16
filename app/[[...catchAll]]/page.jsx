import Link from "next/link";
import { LocalState } from "./local-state";

export default async function Page({ params }) {
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const resolvedParams = await params;
  const count = Number(resolvedParams.catchAll?.[0] ?? 0);

  return (
    <main>
      <pre id="params">params: {JSON.stringify(resolvedParams)}</pre>
      <Link id="increment" href={`${count + 1}`}>
        +
      </Link>
      <LocalState />
    </main>
  );
}
