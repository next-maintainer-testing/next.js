"use server";

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function timedAction(name) {
  const startedAt = Date.now();
  await delay(800);
  const endedAt = Date.now();
  return { name, startedAt, endedAt };
}

export async function runFirstAction() {
  return timedAction("first");
}

export async function runSecondAction() {
  return timedAction("second");
}
