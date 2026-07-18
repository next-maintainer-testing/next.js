const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export default async function Page() {
  await delay(500);
  return <main id="ssr-content">SSR page content</main>;
}
