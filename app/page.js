'use client';

import ShapeManager from '@test/swc-repro';

export default function Page() {
  function reproduce() {
    const manager = new ShapeManager({ getShapes: () => [] });
    manager.veV(
      { JVV: { editor: 'test-editor' } },
      {
        shapes: {
          all: () => [
            { isSelected: () => true, ctV: 'Shape1' },
            { isSelected: () => false, ctV: 'Shape2' },
          ],
        },
      },
    );
  }

  return <button onClick={reproduce}>Run reproduction</button>;
}
