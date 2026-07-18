import { makeAutoObservable } from "mobx";
import { enableStaticRendering } from "mobx-react-lite";

enableStaticRendering(typeof window === "undefined");

export class Store {
  photos = {};

  constructor() {
    makeAutoObservable(this, undefined, { autoBind: true });
  }

  hydrate(data) {
    if (data) this.photos = data;
  }
}
