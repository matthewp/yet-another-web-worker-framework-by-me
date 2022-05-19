import {
  MSG_EVENT
} from "../messages";
import {
  PROP_PROP,
  PROP_CHILDREN,
  EVENT_PROP_TARGET,
  EVENT_TARGET_VALUE
} from "../commit";

export let hostMap = new Map<number, Element>();

export let getAndAssertHost = (id: number): Element => {
  let el = hostMap.get(id);
  if (!el) {
    throw new Error(`Expected to find a host element for id ${id}`);
  }
  return el;
};

let encoder = new TextEncoder();
let buffer: number[] = [];

export class EventListener extends Set<string> {
  constructor(public el: Element, public id: number, public worker: Worker) {
    super();
    this.el = el;
    this.id = id;
    this.worker = worker;
  }
  handleEvent(ev: Event) {
    let typeArr = encoder.encode(ev.type);
    buffer.length = 0;
    buffer.push(MSG_EVENT, this.id, typeArr.length, ...typeArr);
    if(ev.target) {
      buffer.push(EVENT_PROP_TARGET);
      if('value' in ev.target) {
        let el = ev.target as HTMLInputElement;
        let valueArr = encoder.encode(el.value);
        buffer.push(EVENT_TARGET_VALUE, valueArr.length, ...valueArr);
      }
    }

    let arr = Uint8Array.from(buffer);
    this.worker.postMessage(arr.buffer, [arr.buffer]);
  }
}

export let eventMap = new Map<number, EventListener>();