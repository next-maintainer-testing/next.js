import Link from 'next/link';

export const metadata = { title: 'Issue 80639 reproduction' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <header>
          <Link href="/" prefetch={false}>Static header link</Link>
        </header>
        {children}
      </body>
    </html>
  );
}
