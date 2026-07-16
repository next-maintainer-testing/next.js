"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function Navigation() {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  return (
    <nav>
      <button
        data-testid="same-route-push"
        data-hydrated={hydrated}
        onClick={() => router.push("/signin", { scroll: false })}
      >
        Navigate to /signin
      </button>
    </nav>
  );
}
