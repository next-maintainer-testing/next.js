import { Counter } from './Counter';

async function incrementAction(value) {
  'use server';
  return value + 1;
}

export default function Page() {
  return <Counter incrementAction={incrementAction} />;
}
