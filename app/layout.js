import Script from 'next/script';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <div style={{ border: '2px solid red' }}>{children}</div>
        <Script strategy="beforeInteractive">{`console.log('fired from app/layout.js')`}</Script>
      </body>
    </html>
  );
}
