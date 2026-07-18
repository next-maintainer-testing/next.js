import { createContext, useContext } from "react";
import { Store } from "../store";

let store;
const StoreContext = createContext();

export function useStore() {
  const context = useContext(StoreContext);
  if (context === undefined) throw new Error("useStore must be used within StoreProvider");
  return context;
}

function initializeStore(initialData = null) {
  const current = store ?? new Store();
  if (initialData) current.hydrate(initialData);
  if (typeof window === "undefined") return current;
  if (!store) store = current;
  return current;
}

export function StoreProvider({ children, hydrationData }) {
  const current = initializeStore(hydrationData);
  return <StoreContext.Provider value={current}>{children}</StoreContext.Provider>;
}
