import Link from "next/link";

export const metadata = { title: "Issue 74895" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <nav>
          <Link href="/home">Home</Link>{" "}
          <Link href="/payment">Payment</Link>{" "}
          <Link href="/progress">Progress</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
