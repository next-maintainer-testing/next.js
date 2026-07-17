export const metadata = {
  title: 'router.refresh reproduction',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
