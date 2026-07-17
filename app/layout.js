import "./globals.css";

export const metadata = {
  title: "Next.js crypto polyfill reproduction",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
