"use client";

export function ClientForm({ action }) {
  return (
    <form action={action}>
      <button>Submit</button>
    </form>
  );
}
