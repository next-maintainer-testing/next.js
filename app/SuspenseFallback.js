"use client";
import { useEffect } from "react";

export function SuspenseFallback() {
  console.log("DEBBUG: SuspenseComponent rendering", Date.now());
  useEffect(() => {
    console.log("DEBBUG: SuspenseComponent mounting", Date.now());
    return () => console.log("DEBBUG: SuspenseComponent unmounting", Date.now());
  }, []);
  return null;
}
