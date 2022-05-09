import React from "react";
import ReactReconciler from "react-reconciler";
import {
  MSG_CREATE_INSTANCE,
  MSG_CREATE_TEXT,
  MSG_APPEND_TO_HOST,
  MSG_CREATE_HOST,
  MSG_APPEND_CHILD,
  MSG_REMOVE_CHILD,
  MSG_CLEAR_HOST,
  MSG_COMMIT_UPDATE,
  MSG_ADD_EVENT,
  MSG_REMOVE_EVENT,
  MSG_EVENT,
} from "./messages";
import {
  PROP_PROP,
  PROP_CHILDREN,
  EVENT_PROP_TARGET,
  EVENT_TARGET_VALUE,
} from "./commit";

const rootHostContext = {};
const childHostContext = {};

const dynamicMemory = new Uint8Array(16777216);
const encoder = new TextEncoder();
const decoder = new TextDecoder();

self.addEventListener("message", (ev) => {
  let arr = new Uint8Array(ev.data);
  switch (arr[0]) {
    case MSG_EVENT: {
      let id = arr[1];
      let len = arr[2];
      let offset = 3;
      let nameArr = arr.subarray(offset, offset + len);
      offset += len;
      let name = decoder.decode(nameArr);
      let node = eventReceivers.get(id);

      if (!node) {
        throw new Error(`Unable to find an event handler for the [${name}]`);
      }

      let event = new Event(name);
      while(offset < arr.length) {
        let propType = arr[offset];
        switch(propType) {
          case EVENT_PROP_TARGET: {
            Object.defineProperty(event, 'target', {
              value: {}
            });
            offset++;
            propType = arr[offset];
            switch(propType) {
              case EVENT_TARGET_VALUE: {
                offset++;
                let valueLen = arr[offset++];
                let valueArr = arr.subarray(offset, offset + valueLen);
                offset += valueLen;
                let value = decoder.decode(valueArr);
                event.target.value = value;
                break;
              }
              default: {
                throw new Error(`Unknown target prop`);
              }
            }
            break;
          }
          default: {
            throw new Error(`Unknown event prop`);
          }
        }
      }


      node.dispatchEvent(event);
      break;
    }
  }
});

function notify(buffer: ArrayBuffer) {
  self.postMessage(buffer, [buffer]);
}

let globalId = 0;
let eventReceivers = new Map<number, VNode>();

class VNode extends EventTarget {
  public children: VNode[];
  public id: number;
  public events: Map<string, EventListenerOrEventListenerObject> | undefined;
  constructor(public type: string | undefined) {
    super();
    this.children = [];
    this.id = globalId++;
  }
  addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void {
    super.addEventListener(type, callback, options);
    if (!this.events) {
      this.events = new Map();
    }
    this.events.set(type, callback);
  }
  hasEvent(type: string): boolean {
    if (!this.events) {
      return false;
    }
    return this.events.has(type);
  }
  replaceEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void {
    this.removeEventListener(type, this.events.get(type));
    this.addEventListener(type, callback, options);
  }
  appendChild(child: VNode) {
    this.children.push(child);
  }
  removeChild(child: VNode) {
    let idx = this.children.indexOf(child);
    this.children.splice(idx, 1);
  }
}

class TextVNode {
  public data: string;
  public id: number;
  constructor(text: string) {
    this.data = text;
    this.id = globalId++;
  }
}

const isEventProp = (propKey: string) => /^on[A-Z]/.test(propKey);
const getEventNameFromProp = (propKey: string) =>
  propKey[2].toLowerCase() + propKey.slice(3);

function batchUpdate(
  node: VNode,
  updatePayload: any[],
  newProps: Record<string, any>
) {
  dynamicMemory[0] = MSG_COMMIT_UPDATE;
  dynamicMemory[1] = node.id;
  dynamicMemory[2] = 0; // todo change
  let offset = 3;

  let children: Uint8Array | null = null;

  for (let i = 0, len = updatePayload.length; i < len; i += 2) {
    let propKey = updatePayload[i];
    let propValue = updatePayload[i + 1];

    if (propKey === "children") {
      // TODO maek children copy
      let bytes = encoder.encode(propValue + "");
      children = new Uint8Array(bytes.length + 1);
      children[0] = bytes.length;
      children.set(bytes, 1);
    } else if (isEventProp(propKey)) {
      let eventName = getEventNameFromProp(propKey);
      if (node.hasEvent(eventName)) {
        node.replaceEventListener(eventName, propValue);
      } else {
        throw new Error("Cannot update on an unknown event yet.");
      }
    } else {
      const propValue = newProps[propKey];

      //node.setAttribute(propName, propValue);
    }
  }

  if (children !== null) {
    dynamicMemory.set(children, offset);
    offset += children.length;
  }

  let arr = dynamicMemory.slice(0, offset);
  notify(arr.buffer);
}

function writePropIntoDynamicMemory(
  offset: number,
  propKey: string,
  propValue: string
): number {
  dynamicMemory[offset++] = PROP_PROP;

  let keyArr = encoder.encode(propKey);
  let valueArr = encoder.encode(propValue);
  dynamicMemory[offset++] = keyArr.length;
  dynamicMemory.set(keyArr, offset);
  offset += keyArr.length;
  dynamicMemory[offset++] = valueArr.length;
  dynamicMemory.set(valueArr, offset);
  offset += valueArr.length;

  return offset;
}

const hostConfig = {
  now: Date.now,
  getRootHostContext: () => {
    return rootHostContext;
  },
  prepareForCommit: () => {},
  resetAfterCommit: () => {},
  getChildHostContext: () => {
    return childHostContext;
  },
  shouldSetTextContent: (_type, props) => {
    return (
      typeof props.children === "string" || typeof props.children === "number"
    );
  },
  /**
   This is where react-reconciler wants to create an instance of UI element in terms of the target. Since our target here is the DOM, we will create document.createElement and type is the argument that contains the type string like div or img or h1 etc. The initial values of domElement attributes can be set in this function from the newProps argument
   */
  createInstance: (
    type,
    newProps: Record<string, any>,
    rootContainerInstance,
    _currentHostContext,
    workInProgress
  ) => {
    const bytes = encoder.encode(type);
    const vnode = new VNode(type);
    dynamicMemory[0] = MSG_CREATE_INSTANCE;
    dynamicMemory[1] = vnode.id;
    dynamicMemory[2] = bytes.length;
    dynamicMemory.set(bytes, 3);

    let offset = 3 + bytes.length;
    let propOffset = offset;
    dynamicMemory[propOffset] = 0; // props
    offset++;

    Object.keys(newProps).forEach((propKey) => {
      let propValue = newProps[propKey];
      if (propKey === "children") {
        let type = typeof newProps.children;
        if (type === "string" || type === "number") {
          let text = newProps.children;
          let bytes = encoder.encode(text);
          dynamicMemory[offset++] = PROP_CHILDREN;
          dynamicMemory[offset++] = bytes.length;
          dynamicMemory.set(bytes, offset);
          offset += bytes.length;
        }
      } else if (isEventProp(propKey)) {
      } else {
        if (typeof propValue !== "string") {
          throw new Error("non-strings not currently supported");
        }
        offset = writePropIntoDynamicMemory(offset, propKey, propValue);
      }
    });

    let arr = dynamicMemory.slice(0, offset);
    notify(arr.buffer);
    return vnode;
  },
  createTextInstance(text: string) {
    let node = new TextVNode(text);
    let arr = new Uint8Array(1024);
    arr[0] = MSG_CREATE_TEXT;
    arr[1] = node.id;
    let bytes = encoder.encode(text);
    arr[2] = bytes.length;
    arr.set(bytes, 3);
    notify(arr.buffer);
    return node;
    //return document.createTextNode(text);
  },
  appendInitialChild: (parent, child) => {
    let arr = new Uint8Array(3);
    arr[0] = MSG_APPEND_CHILD;
    arr[1] = child.id;
    arr[2] = parent.id;
    notify(arr.buffer);
    parent.appendChild(child);
  },
  appendChild(parent, child) {
    console.log("appendChild", parent);
    parent.appendChild(child);
  },
  finalizeInitialChildren: () => {
    return true;
  },
  insertInContainerBefore(container, child, beforeChild) {
    console.log("insertInContainerBefore", container, child, beforeChild);
  },
  commitMount(instance: VNode, type, props, internalHandle) {
    Object.keys(props).forEach((propKey) => {
      let propValue = props[propKey];
      if (isEventProp(propKey)) {
        let eventName = getEventNameFromProp(propKey);
        let arr = new Uint8Array(1024);
        arr[0] = MSG_ADD_EVENT;
        arr[1] = instance.id;
        let bytes = encoder.encode(eventName);
        arr[2] = bytes.length;
        arr.set(bytes, 3);
        notify(arr.buffer);
        instance.addEventListener(eventName, propValue);
        eventReceivers.set(instance.id, instance);
      } else if (propKey === "children") {
        return;
      } else {
        // TODO what do?
      }
    });
  },
  supportsMutation: true,
  appendChildToContainer: (parent, child) => {
    const arr = new Uint8Array(1024);
    arr[0] = MSG_APPEND_TO_HOST;
    arr[1] = child.id;
    arr[2] = parent.id;
    notify(arr.buffer);
    parent.appendChild(child);
  },
  prepareUpdate(instance, type, oldProps, newProps) {
    let updatePayload = null;
    Object.keys(newProps).forEach((propKey) => {
      let nextProp = newProps[propKey];
      let oldProp = oldProps[propKey];
      if (nextProp !== oldProp) {
        if (propKey === "children") {
          if (typeof nextProp === "string" || typeof nextProp === "number") {
            (updatePayload = updatePayload || []).push(propKey, "" + nextProp);
          }
        } else {
          (updatePayload = updatePayload || []).push(propKey, nextProp);
        }
      }
    });
    return updatePayload;
  },
  commitUpdate(node, updatePayload, type, oldProps, newProps) {
    dynamicMemory[0] = MSG_COMMIT_UPDATE;
    dynamicMemory[1] = node.id;
    dynamicMemory[2] = 0; // todo change
    let offset = 3;

    let children: Uint8Array | null = null;

    for (let i = 0, len = updatePayload.length; i < len; i += 2) {
      let propKey = updatePayload[i];
      let propValue = updatePayload[i + 1];

      if (propKey === "children") {
        // TODO maek children copy
        let bytes = encoder.encode(propValue + "");
        dynamicMemory[offset++] = PROP_CHILDREN;
        dynamicMemory[offset++] = bytes.length;
        dynamicMemory.set(bytes, offset);
        offset += bytes.length;
      } else if (isEventProp(propKey)) {
        let eventName = getEventNameFromProp(propKey);
        if (node.hasEvent(eventName)) {
          node.replaceEventListener(eventName, propValue);
        } else {
          throw new Error("Cannot update on an unknown event yet.");
        }
      } else {
        offset = writePropIntoDynamicMemory(offset, propKey, propValue);
      }
    }

    let arr = dynamicMemory.slice(0, offset);
    notify(arr.buffer);
  },
  commitTextUpdate(textInstance, oldText, newText) {
    console.log("TEXT UPDATE");
    textInstance.text = newText;
  },
  removeChild(parentInstance, child) {
    console.log("SEND MESSAGE HERE");
    parentInstance.removeChild(child);
  },
  detachDeletedInstance(instance) {
    if(instance.events) {
      for(let [type] of instance.events) {
        dynamicMemory[0] = MSG_REMOVE_EVENT;
        dynamicMemory[1] = instance.id;
        let offset = 2;
        let typeArr = encoder.encode(type);
        dynamicMemory[offset++] = typeArr.length;
        dynamicMemory.set(typeArr, offset);
        offset += typeArr.length;
        let arr = dynamicMemory.slice(0, offset);
        notify(arr.buffer);
      }
    }

    eventReceivers.delete(instance.id);
  },
  clearContainer(container) {
    let arr = new Uint8Array(2);
    arr[0] = MSG_CLEAR_HOST;
    arr[1] = container.id;
    notify(arr.buffer);
  },
  getPublicInstance(instance) {
    return instance;
  },
  supportsHydration: true,
  canHydrateInstance(instance) {
    debugger;
    return true;
  },
  hydrateInstance(instance) {
    debugger;
  },
  getFirstHydratableChildWithinContainer(container) {
    return null;
  },
  getFirstHydratableChild(container) {
    debugger;
    return void 0;
  },
  errorHydratingContainer(container) {
    console.error(`errorHydratingContainer`, container);
  },
  didNotFindHydratableInstanceWithinContainer(parentContainer, type, props) {
    debugger;
  },
};

const ReactReconcilerInst = ReactReconciler(hostConfig);

/* global reportError */
const defaultOnRecoverableError =
  typeof reportError === "function"
    ? // In modern browsers, reportError will dispatch an error event,
      // emulating an uncaught JavaScript error.
      reportError
    : (error: any) => {
        // In older browsers and test environments, fallback to console.error.
        // eslint-disable-next-line react-internal/no-production-logging
        console["error"](error);
      };

function sendHostCreated(host: VNode, selector: string) {
  const bytes = encoder.encode(selector);
  const arr = new Uint8Array(bytes.length + 3);
  arr[0] = MSG_CREATE_HOST;
  arr[1] = host.id;
  arr[2] = bytes.length;
  arr.set(bytes, 3);
  notify(arr.buffer);
}

export const WW = {
  roots: new Map<string, VNode>(),
  render: (
    reactElement: React.ReactElement,
    selector: string,
    callback: (() => any) | undefined = undefined
  ) => {
    let host = WW.roots.get(selector);
    if (!host) {
      host = new VNode(undefined);
      host.rootContainer = ReactReconcilerInst.createContainer(host, false);
      sendHostCreated(host, selector);
    }

    // update the root Container
    return ReactReconcilerInst.updateContainer(
      reactElement,
      host.rootContainer,
      null,
      callback
    );
  },
  hydrate(reactElement: React.ReactElement, selector: string) {
    let host = WW.roots.get(selector);
    if (!host) {
      host = new VNode(undefined);
      //host.rootContainer = ReactReconcilerInst.createContainer(host, false);
      host.rootContainer = ReactReconcilerInst.createHydrationContainer(
        reactElement,
        null,
        host,
        null, // ConcurrentRoot
        {}, // hydrationCallbacks
        false, // isStrictMode
        false, // concurrentUpdatesByDefaultOverride
        "", // identifierPrefix
        defaultOnRecoverableError, // onRecoverableError
        null // transitionCallbacks
      );

      sendHostCreated(host, selector);
    }
    const callback = () => {
      console.log("callback!");
    };

    // update the root Container
    return ReactReconcilerInst.updateContainer(
      reactElement,
      host.rootContainer,
      null,
      callback
    );
  },
};
