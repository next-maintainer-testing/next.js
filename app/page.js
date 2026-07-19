import { getSessionValue } from "./request-client";

export default async function Page() {
  const session = await getSessionValue();
  return <main>Session: {session}</main>;
}
