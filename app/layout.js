export const metadata = { title: "Next.js prefetch reproduction" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
