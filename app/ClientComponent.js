"use client";
import { useEffect } from "react";

export function ClientComponent() {
  console.log("DEBBUG: ClientComponent rendering", Date.now());
  useEffect(() => {
    console.log("DEBBUG: ClientComponent mounting", Date.now());
    return () => console.log("DEBBUG: ClientComponent unmounting", Date.now());
  }, []);
  return <div>ClientComponent</div>;
}
