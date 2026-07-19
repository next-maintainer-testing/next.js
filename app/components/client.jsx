'use client';

export function ClientComponent({ children }) {
  return <main>{children}</main>;
}

export function InternalClientComponent({ children }) {
  const childType = String(children.$$typeof);
  return (
    <section data-child-type={childType}>
      <output id="child-type">{childType}</output>
      {children}
    </section>
  );
}
