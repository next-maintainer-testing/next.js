export const metadata = {title: 'Encoded dynamic route chunk reproduction'};

export default function RootLayout({children}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
