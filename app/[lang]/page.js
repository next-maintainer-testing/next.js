export function generateStaticParams() {
  return ["en", "es"].map((lang) => ({ lang }));
}

export default function LangPage() {
  return <main>Content</main>;
}
