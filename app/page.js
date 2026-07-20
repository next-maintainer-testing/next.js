async function AsyncComponent() {
  await new Promise((resolve) => setTimeout(resolve, 20));
  await new Promise((resolve) => setTimeout(resolve, 20));

  const ThrowingComponent = () => {
    throw new Error("Intentional error in AsyncComponent");
  };

  return <ThrowingComponent />;
}

export default async function Home() {
  await new Promise((resolve) => setTimeout(resolve, 20));
  await new Promise((resolve) => setTimeout(resolve, 20));
  return <AsyncComponent />;
}
