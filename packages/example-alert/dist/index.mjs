import { Alert } from "@mui/material";
import { jsx } from "react/jsx-runtime";

function ExampleAlert() {
  return jsx(Alert, { children: "This is a simple alert!" });
}

export { ExampleAlert };
