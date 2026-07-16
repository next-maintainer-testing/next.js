import "./globals.css";

export const metadata = {
  title: "Static export file URL reproduction",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
