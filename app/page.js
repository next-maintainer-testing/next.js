"use client";

import { useState } from "react";

function Frame({ title }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <section>
      <p>Loaded: {loaded ? "true" : "false"}</p>
      <iframe
        src="http://localhost:5173"
        title={title}
        onLoad={() => setLoaded(true)}
      />
    </section>
  );
}

export default function Page() {
  return (
    <main>
      <Frame title="Frame 1" />
      <Frame title="Frame 2" />
      <Frame title="Frame 3" />
    </main>
  );
}
