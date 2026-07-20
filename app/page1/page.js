import Link from "next/link";

export default function Page1() {
  return (
    <main>
      <p>Page 1 content</p>
      <Link href="/" prefetch={true}>Link to home</Link>
    </main>
  );
}
