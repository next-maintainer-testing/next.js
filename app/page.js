export async function generateMetadata(_props, parent) {
  const parentMetadata = await parent

  return {
    icons: {
      ...parentMetadata.icons,
      icon: [
        ...(parentMetadata.icons?.icon ?? []),
        { url: '/child-icon.svg', type: 'image/svg+xml' },
      ],
    },
  }
}

export default function Page() {
  return <main>Issue 78013 reproduction</main>
}
