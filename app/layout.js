export const metadata = { title: 'Issue 69446 reproduction' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <script dangerouslySetInnerHTML={{ __html: 'window.startTime = Date.now()' }} />
        {children}
      </body>
    </html>
  );
}
