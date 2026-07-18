import Page from "../../components/Page";

export default function SSG() {
  return <Page />;
}

export async function getStaticProps({ params }) {
  const photos = Array.from({ length: 50 }, (_, index) => ({
    albumId: Number(params.id),
    id: index,
    title: `photo ${index}`,
    url: `https://example.com/${index}`,
    thumbnailUrl: `https://example.com/thumb/${index}`,
  }));
  return {
    props: {
      hydrationData: new Array(25).fill(photos),
    },
  };
}

export async function getStaticPaths() {
  return { paths: [], fallback: "blocking" };
}
