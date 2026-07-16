import Navigation from "./Navigation";

export default function RootLayout({ children, authModal }) {
  return (
    <html lang="en">
      <body>
        <Navigation />
        {children}
        {authModal}
      </body>
    </html>
  );
}
