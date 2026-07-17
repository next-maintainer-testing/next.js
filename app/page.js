"use client";

import { useState } from "react";
import { runFirstAction, runSecondAction } from "./actions";

export default function Page() {
  const [result, setResult] = useState({ status: "idle" });

  async function run() {
    setResult({ status: "running" });
    const clientStartedAt = performance.now();
    const [first, second] = await Promise.all([
      runFirstAction(),
      runSecondAction(),
    ]);
    const elapsed = performance.now() - clientStartedAt;
    const overlap = Math.min(first.endedAt, second.endedAt) -
      Math.max(first.startedAt, second.startedAt);
    setResult({ status: "complete", elapsed, overlap, first, second });
  }

  return (
    <main>
      <button id="start" onClick={run}>Start</button>
      <output id="result" data-status={result.status}>
        {JSON.stringify(result)}
      </output>
    </main>
  );
}
