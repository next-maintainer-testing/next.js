import Link from "next/link";

export default function Home() {
  return (
    <main>
      <p>Home page content</p>
      <Link href="/page1" prefetch={true}>Link to page 1</Link>
    </main>
  );
}
