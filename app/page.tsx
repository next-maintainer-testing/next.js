import { ExportedClass, ExportedEnum, ExportedType } from "simple-package";

export default function Home() {
  const msg: ExportedType = {
    message: "I am warning you",
    severity: ExportedEnum.warning,
  };
  return new ExportedClass(msg).toExportString();
}
