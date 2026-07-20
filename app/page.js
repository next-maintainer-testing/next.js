import { readTrace } from "./trace";

export const dynamic = "force-dynamic";

export default function Page() {
  const trace = readTrace();
  return (
    <main>
      <h1>Layout instrumentation scope</h1>
      <p id="trace-result" data-trace={trace}>
        Page observed trace: {trace}
      </p>
    </main>
  );
}
