import rawCss from '!!raw-loader!./foo.css';

export default function Page() {
  return (
    <main>
      <h1>Raw CSS source</h1>
      <pre data-testid="raw-css">{rawCss}</pre>
    </main>
  );
}
