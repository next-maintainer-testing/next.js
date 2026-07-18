import { marked } from "marked";
import nextPackage from "next/package.json";

export const dynamic = "force-dynamic";

const paths = [
  "docs/01-app/03-api-reference/05-config/01-next-config-js/output.mdx",
  "docs/01-app/05-api-reference/05-config/01-next-config-js/output.mdx",
];

async function loadVersionedOutputDocumentation(version) {
  for (const path of paths) {
    const url = `https://raw.githubusercontent.com/vercel/next.js/v${version}/${path}`;
    const response = await fetch(url, { cache: "no-store" });
    if (response.ok) return { source: await response.text(), url };
    if (response.status !== 404) {
      throw new Error(`Unable to fetch ${url}: HTTP ${response.status}`);
    }
  }
  throw new Error(`No output.mdx documentation found for Next.js ${version}`);
}

export default async function Page() {
  const version = nextPackage.version;
  const { source, url } = await loadVersionedOutputDocumentation(version);
  const withoutFrontmatter = source.replace(/^---[\s\S]*?---\s*/, "");
  const html = await marked.parse(withoutFrontmatter);

  return (
    <main data-next-version={version} data-documentation-source={url}>
      <h1>Rendered output configuration reference from Next.js {version}</h1>
      <article dangerouslySetInnerHTML={{ __html: html }} />
    </main>
  );
}
