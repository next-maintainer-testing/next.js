"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Shortcut() {
  const router = useRouter();
  useEffect(() => {
    const open = (event) => {
      if (event.metaKey && event.key === "k") router.push("/command");
    };
    window.addEventListener("keydown", open);
    return () => window.removeEventListener("keydown", open);
  }, [router]);
  return null;
}
