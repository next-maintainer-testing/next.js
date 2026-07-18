export const metadata = {
  title: 'Raw loader CSS reproduction',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
