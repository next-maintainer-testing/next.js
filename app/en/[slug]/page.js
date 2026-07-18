import { notFound } from "next/navigation";

export const revalidate = 10;
export const dynamic = "force-static";
export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

export default async function Page({ params }) {
  const { slug } = await params;
  if (slug === "404") notFound();
  return <h1>{slug}</h1>;
}
