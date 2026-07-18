import { revalidatePath } from "next/cache";

export default function Home() {
  async function revalidate() {
    "use server";
    revalidatePath("/", "layout");
  }

  return (
    <main>
      Home
      <form action={revalidate}>
        <button type="submit">Revalidate</button>
      </form>
    </main>
  );
}
