import './global.css';

export const metadata = {
  title: 'NextGram',
  description: 'Intercepted route metadata reproduction',
};

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
