export class Bus<Events> {
  private readonly target = new EventTarget();

  addEventListener<K extends Extract<keyof Events, string>>(
    type: K,
    listener: (event: CustomEvent<Events[K]>) => void,
  ): void {
    this.target.addEventListener(type, event => {
      // The private target only receives events from the typed emit method.
      listener(event as CustomEvent<Events[K]>);
    });
  }

  emit<K extends Extract<keyof Events, string>>(type: K, detail: Events[K]): void {
    this.target.dispatchEvent(new CustomEvent(type, { detail }));
  }
}
