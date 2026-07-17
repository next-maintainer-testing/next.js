export const metadata = { title: 'Issue 76957 reproduction' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
