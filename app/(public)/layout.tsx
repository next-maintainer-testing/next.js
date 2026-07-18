import type { ReactNode } from "react";
import { Footer } from "../../components/Footer";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Footer />
    </>
  );
}
