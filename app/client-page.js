"use client";

import { useEffect, useState } from "react";
import { marker } from "./marker";

export default function ClientPage() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return <main>{hydrated ? `Loaded deployment ${marker}` : null}</main>;
}
