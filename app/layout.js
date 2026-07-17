export const metadata = {
  title: "Stable Root Title",
  description: "Static metadata from the root layout",
};

export const viewport = {
  themeColor: "#123456",
  width: "device-width",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
