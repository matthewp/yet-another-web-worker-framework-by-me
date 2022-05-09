import {
  MSG_APPEND_TO_HOST,
  MSG_CREATE_HOST,
  MSG_CREATE_INSTANCE,
  MSG_APPEND_CHILD,
  MSG_CREATE_TEXT,
  MSG_COMMIT_UPDATE,
  MSG_ADD_EVENT,
  MSG_REMOVE_EVENT,
  MSG_EVENT,
  MSG_CLEAR_HOST,
} from "./messages";
import {
  PROP_PROP,
  PROP_CHILDREN,
  EVENT_PROP_TARGET,
  EVENT_TARGET_VALUE
} from "./commit";

let decoder = new TextDecoder();
let encoder = new TextEncoder();

let hostMap = new Map<number, Element>();
let getAndAssertHost = (id: number): Element => {
  let el = hostMap.get(id);
  if (!el) {
    throw new Error(`Expected to find a host element for id ${id}`);
  }
  return el;
};

function applyBatchUpdate(
  el: Element,
  arr: Uint8Array,
  offset: number
): number {
  while (offset < arr.length) {
    let type = arr[offset];
    switch (type) {
      // Prop
      case PROP_PROP: {
        offset++;
        let keyLen = arr[offset++];
        let keyArr = arr.subarray(offset, offset + keyLen);
        let key = decoder.decode(keyArr);
        offset += keyLen;
        let valueLen = arr[offset++];
        let valueArr = arr.subarray(offset, offset + valueLen);
        let value = decoder.decode(valueArr);
        offset += valueLen;

        if(key in el) {
          Reflect.set(el, key, value);
        } else {
          el.setAttribute(key, value);
        }
        break;
      }
      // TextContent
      case PROP_CHILDREN: {
        offset++;
        let textLen = arr[offset++];
        let textArr = arr.subarray(offset, offset + textLen);
        let text = decoder.decode(textArr);
        el.textContent = text;
        offset += textArr.length;
        break;
      }
      default: {
        //debugger;
        throw new Error(`Cannot set prop type ${arr[offset]}`);
      }
    }
  }
  return offset;
}

let buffer: number[] = [];

let handler = {
  [MSG_CREATE_INSTANCE](arr: Uint8Array) {
    let id = arr[1];
    const len = arr[2];
    let offset = 3;
    const tagName = decoder.decode(arr.subarray(offset, offset + len));
    const el = document.createElement(tagName);

    offset += len;
    let attrLen = arr[offset];
    // TODO something with attrs
    if (attrLen) {
      throw new Error("attrs not supported");
    } else {
      offset++;
    }

    applyBatchUpdate(el, arr, offset);
    hostMap.set(id, el);
  },
  [MSG_APPEND_TO_HOST](arr: Uint8Array) {
    let id = arr[1];
    let parentId = arr[2];
    getAndAssertHost(parentId).append(getAndAssertHost(id));
  },
  [MSG_CREATE_HOST](arr: Uint8Array) {
    let id = arr[1];
    let len = arr[2];
    let selectorArr = arr.subarray(3, 3 + len);
    let selector = decoder.decode(selectorArr);
    let el = document.querySelector(selector);
    if (!el) {
      throw new Error(
        `Could not find an element for the selector [${selector}]`
      );
    }
    hostMap.set(id, el);
  },
  [MSG_APPEND_CHILD](arr: Uint8Array) {
    getAndAssertHost(arr[2]).append(getAndAssertHost(arr[1]));
  },
  [MSG_CLEAR_HOST](arr: Uint8Array) {
    let id = arr[1];
    getAndAssertHost(id).replaceChildren();
  },
  [MSG_CREATE_TEXT](arr: Uint8Array) {
    let id = arr[1];
    let len = arr[2];
    let textArr = arr.subarray(3, 3 + len);
    let text = decoder.decode(textArr);
    let tn = document.createTextNode(text);
    hostMap.set(id, tn);
  },
  [MSG_COMMIT_UPDATE](arr: Uint8Array) {
    let id = arr[1];
    let propLen = arr[2]; // TODO use

    let offset = 3;

    let el = getAndAssertHost(id);
    applyBatchUpdate(el, arr, offset);
  },
  [MSG_ADD_EVENT](arr: Uint8Array, worker: Worker) {
    let id = arr[1];
    let len = arr[2];
    let nameArr = arr.subarray(3, 3 + len);
    let name = decoder.decode(nameArr);
    let el = getAndAssertHost(id);
    el.addEventListener(name, (ev) => {
      let typeArr = encoder.encode(ev.type);
      buffer.length = 0;
      buffer.push(MSG_EVENT, id, typeArr.length, ...typeArr);
      if(ev.target) {
        buffer.push(EVENT_PROP_TARGET);
        if('value' in ev.target) {
          let valueArr = encoder.encode(ev.target.value);
          buffer.push(EVENT_TARGET_VALUE, valueArr.length, ...valueArr);
        }
      }

      let arr = Uint8Array.from(buffer);
      worker.postMessage(arr.buffer, [arr.buffer]);
    });
  },
  [MSG_REMOVE_EVENT](arr: Uint8Array) {
    let id = arr[1];
    let typeLen = arr[2];
    let typeArr = arr.subarray(3, 3 + typeLen);
    let type = decoder.decode(typeArr);
    
  }
};

export const use = (src: string) => {
  let worker = new Worker(src, { type: "module" });
  worker.addEventListener("message", (ev) => {
    const msg = ev.data;
    const arr = new Uint8Array(msg);
    const msgType = arr[0] + "";
    if (!(msgType in handler)) {
      throw new Error(`Unable to find message of type [${msgType}]`);
    }
    type k = keyof typeof handler;
    handler[msgType as unknown as k](arr, worker);
  });
};
