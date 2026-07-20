export function generateMetadata() {
  return {
    metadataBase: new URL('http://localhost:3000'),
    title: 'Generate Metadata Query Reproduction',
    alternates: {
      canonical: '/',
      languages: {
        'x-default': '/',
        en: '/?hl=en_US',
        ko: '/?hl=ko_KR',
      },
    },
  };
}

export default function Page() {
  return <main>Issue 72810 reproduction</main>;
}
