"use client";

import { useCallback } from "react";
import { renderMathInElement } from "mathlive";

export default function MathLive() {
  const setStaticRef = useCallback((node) => {
    if (node) renderMathInElement(node);
  }, []);

  return <div ref={setStaticRef}>The identity is $x + 0 = x$.</div>;
}
