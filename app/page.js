"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBoardAction } from "./actions";

export default function Home() {
  const router = useRouter();
  const [title, setTitle] = useState("");

  function prefetch(value) {
    if (!value.trim()) return;
    router.prefetch(`/dashboard/${value.toLowerCase().replace(/\s+/g, "-")}`);
  }

  return (
    <main>
      <h1>Create a New Board</h1>
      <form action={async (formData) => {
        const result = await createBoardAction(formData);
        router.push(`/dashboard/${result.slug}`);
      }}>
        <label htmlFor="title">Board Title</label>
        <input
          id="title"
          name="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={(event) => prefetch(event.target.value)}
          autoFocus
          required
        />
        <button>Create Board</button>
      </form>
    </main>
  );
}
