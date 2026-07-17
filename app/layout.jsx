export const metadata = { title: 'Next.js issue 82559 reproduction' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
