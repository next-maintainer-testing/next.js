import { cookies } from "next/headers";
import MomentClient from "./moment-client";
import JqueryClient from "./jquery-client";

export const dynamic = "force-dynamic";

export default async function Page() {
  const cookieStore = await cookies();
  const renderMoment = cookieStore.get("RENDER_MOMENT")?.value === "1";
  const renderJquery = cookieStore.get("RENDER_JQUERY")?.value === "1";

  return (
    <main>
      <h1>Conditional client component reproduction</h1>
      {renderMoment && <MomentClient />}
      {renderJquery && <JqueryClient />}
    </main>
  );
}
