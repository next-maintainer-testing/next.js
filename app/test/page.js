import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";

async function withGuest() {
  const cookieStore = await cookies();
  if (cookieStore.get("AUTH_SESSION") !== undefined) {
    redirect("/");
  }
}

export default async function ForgotPassword() {
  await connection();
  await withGuest();

  return <div>Forgot Password</div>;
}
