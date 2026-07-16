"use client";

import { useState } from "react";

export function LocalState() {
  const [state, setState] = useState("initial");

  return (
    <section>
      <output id="local-state">{state}</output>
      <button id="set-state" onClick={() => setState("preserved-marker")}>
        update state
      </button>
    </section>
  );
}
