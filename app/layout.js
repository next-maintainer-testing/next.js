export default function RootLayout({ children, modal }) {
  return (
    <html>
      <body>
        {children}
        {modal}
        <div id="modal-root" />
      </body>
    </html>
  );
}
