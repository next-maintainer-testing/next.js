const fetchWithRequest = () => {
  const request = new Request("https://example.com", {
    mode: "no-cors",
    method: "POST",
    body: "",
  });

  return fetch(request);
};

export async function generateStaticParams() {
  await fetchWithRequest();
  return [];
}

export default async function Page({ params }) {
  const { pageId } = await params;
  return <main>Page {pageId}</main>;
}
