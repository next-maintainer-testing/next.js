export async function getServerSideProps({ query }) {
  const apple = typeof query.apple === "string" ? query.apple : "x";
  const arr = {};
  let a = "POST", c = "l", b;

  if (apple.includes("aa")) {
    b = a;
  }

  arr[b || c] = {};

  return {
    props: {
      result: Object.keys(arr)[0],
    },
  };
}

export default function Home({ result }) {
  return <main><p id="result">{result}</p></main>;
}
