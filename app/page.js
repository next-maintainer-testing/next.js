import dynamic from "next/dynamic";

const CachedHeader = dynamic(() => import("./cached-header"));

export default function Page() {
  return <CachedHeader />;
}
