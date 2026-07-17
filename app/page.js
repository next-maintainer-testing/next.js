import { redirect } from "next/navigation";

async function redirectAction() {
  "use server";
  redirect("/example?hello=world#hash");
}

export default function Home() {
  return (
    <main>
      <form action={redirectAction}>
        <button type="submit">Redirect to /example?hello=world#hash</button>
      </form>
    </main>
  );
}
