import dynamic from "next/dynamic";

// Node16 resolution currently types next/dynamic as a module namespace.
// @ts-expect-error -- Keep the reproduction focused on bundling the .js specifier.
const Button = dynamic(() => import("./Button.js"), { ssr: false });

export default function Home() {
  return (
    <main>
      <h1>Dynamic import with a Node16-style .js specifier</h1>
      <Button />
    </main>
  );
}
