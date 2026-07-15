'use client';

import React, { memo, useEffect, useState } from 'react';

function Shell({ children }) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    window.__shellMounts = (window.__shellMounts || 0) + 1;
  }, []);

  return (
    <div>
      <output id="state-value">{value}</output>
      <button id="increment" onClick={() => setValue((current) => current + 1)}>
        Increment
      </button>
      {children}
    </div>
  );
}

export default memo(Shell);
