export enum ExportedEnum {
  success = "success",
  info = "info",
  warning = "warning",
  error = "error",
}

export type ExportedType = {
  message: string;
  severity: ExportedEnum;
};

export interface ExportedInterface {
  toExportString(): string;
}

export class ExportedClass implements ExportedInterface {
  constructor(public exportMessage: ExportedType) {}

  toExportString(): string {
    return `Export message: [${this.exportMessage.severity}] ${this.exportMessage.message}`;
  }
}
