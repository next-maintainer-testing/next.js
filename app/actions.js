"use server";

export async function createBoardAction(formData) {
  const title = formData.get("title");
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return { slug: title.toLowerCase().replace(/\s+/g, "-") || "default" };
}
