import { InternalClientComponent } from './client';

export function ServerComponent({ data }) {
  return (
    <div data-count={data.length}>
      <InternalClientComponent>
        <button>test</button>
      </InternalClientComponent>
    </div>
  );
}
