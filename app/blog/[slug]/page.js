const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default async function BlogPost({ params }) {
  await sleep(2500);
  return <main id="post">POST_READY_{params.slug}</main>;
}
