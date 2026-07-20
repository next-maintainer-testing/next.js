import { AsyncLocalStorage } from "node:async_hooks";

const globalKey = "__next71601TraceStorage";
const globals = globalThis;

export const traceStorage =
  globals[globalKey] || (globals[globalKey] = new AsyncLocalStorage());

export function runWithLayoutTrace(callback) {
  return traceStorage.run("layout-trace", callback);
}

export function readTrace() {
  return traceStorage.getStore() || "missing";
}
