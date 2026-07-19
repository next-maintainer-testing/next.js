import "./globals.css";

export const metadata = {
  title: "Issue 76074 reproduction",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="geist-font-variables">{children}</body>
    </html>
  );
}
