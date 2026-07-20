export const metadata = {
  title: 'Issue 58052 reproduction',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
