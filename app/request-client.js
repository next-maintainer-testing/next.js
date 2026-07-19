import { cookies } from "next/headers";

// This mirrors the report: a request-bound client is initialized at module scope.
const cookieStore = cookies();

export async function getSessionValue() {
  const store = await cookieStore;
  return store.get("session")?.value ?? "none";
}
