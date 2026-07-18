export const dynamicParams = false;

export function generateStaticParams() {
  return [{ id: "01" }, { id: "02" }];
}

export default async function ParamsPage({ params }) {
  const { id } = await params;
  return <div>{`Params : ${id}`}</div>;
}
