"use client";

import moment from "moment";

export default function MomentClient() {
  const fingerprint = "MOMENT_CC_FINGERPRINT";
  return (
    <section data-component="moment">
      Client component (With moment): {moment.utc(0).format("YYYY-MM-DD")} {fingerprint}
    </section>
  );
}
