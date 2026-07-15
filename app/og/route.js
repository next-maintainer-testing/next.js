import React from "react";
import { ImageResponse } from "next/og";

export async function GET() {
  return new ImageResponse(
    React.createElement(
      "div",
      {
        lang: "ar",
        style: {
          fontSize: 128,
          background: "white",
          width: "100%",
          height: "100%",
          display: "flex",
          textAlign: "center",
          alignItems: "center",
          justifyContent: "center",
        },
      },
      "نطق الأسماء على المستوى"
    ),
    { width: 1200, height: 600 }
  );
}
