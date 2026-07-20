export default function Page() {
  const id = "captured-id-74961";

  async function action() {
    "use server";

    console.log(`SERVER_ACTION_ID:${id}`);

    // Defining a callback inside the action incorrectly prevents the compiler
    // in the reported release from capturing `id` from the render scope.
    [1, 2, 3].map((value) => value + 1);
  }

  return (
    <main>
      <form action={action}>
        <button type="submit">Run server action</button>
      </form>
    </main>
  );
}
