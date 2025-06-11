import * as Y from "yjs";

// Symbols
export const YJS = Symbol("YJS");
export const INTERNALS = Symbol("INTERNALS");

function normalize(val) {
  // If the user puts in a plain object → convert to Y.Map for deep sync
  if (Array.isArray(val)) {
    const yArray = new Y.Array();
    yArray.insert(0, val.map(normalize));
    return yArray;
  } else if (
    val &&
    typeof val === "object" &&
    !(val instanceof Y.AbstractType)
  ) {
    const yMap = new Y.Map();
    Object.entries(val).forEach(([k, v]) => yMap.set(k, normalize(v)));
    return yMap;
  }
  return val;
}

/* Base proxy to access and mutate Y.Map and Y.Array objects */
export function MapProxy(yObj, tracking: boolean = false) {
  if (!(yObj instanceof Y.AbstractType)) {
    throw new TypeError("yProxy() expects a Y.Map or Y.Array");
  }

  const internals = {
    observer: null,
    weakParent: null,
    invalidate: () => {
      // Invalidate the cache when the array changes
      yToProxyCache.delete(yObj);
      if (internals.weakParent) {
        const parent = internals.weakParent.deref();
        if (parent !== undefined) {
          // If the parent is gone, remove the weak reference
          parent[INTERNALS].invalidate();
        }
      }
    },
  };

  const handler = {
    get(target, prop, receiver) {
      switch (prop) {
        case YJS:
          // Return the underlying YJS object
          return yObj;
        case INTERNALS:
          // Return internal properties (eg, observer)
          return internals;
        case "toString":
          return () => JSON.stringify(target.toJSON());
        case "toJSON":
          return () => target.toJSON();
        case Symbol.toPrimitive:
          return (hint: string) =>
            hint === "string" ? JSON.stringify(target.toJSON()) : target; // for "number" / "default" hints
      }
      if (typeof prop === "symbol" || prop in Object.prototype) {
        return Reflect.get(target, prop, receiver);
      }
      const val = target.get(prop);
      return proxy(val, tracking, weakSelf);
    },

    set(target, prop, value) {
      target.set(prop, normalize(value));
      return true;
    },

    deleteProperty(target, prop) {
      target.delete(prop);
      return true;
    },

    ownKeys(target) {
      return Array.from(target.keys()) as string[];
    },
    has(target, prop) {
      return target.has(prop);
    },
    getOwnPropertyDescriptor() {
      // Required so that Object.keys / for…in work
      return { enumerable: true, configurable: true };
    },
  };

  const proxySelf = new Proxy(yObj, handler);
  const weakSelf = new WeakRef<any>(proxySelf);
  return proxySelf; // return the proxy
}

export function ArrayProxy<T>(yObj: Y.Array<T>, tracking: boolean = false) {
  if (!(yObj instanceof Y.AbstractType)) {
    throw new TypeError("yProxy() expects a Y.Map or Y.Array");
  }

  /* Mutation methods */
  function splice(
    this: Y.Array<T>,
    start: number,
    deleteCount?: number,
    ...items: T[]
  ): void {
    // turn splice into Y.Array.insert + Y.Array.delete
    yObj.delete(start, deleteCount || 0);
    if (items.length > 0) {
      yObj.insert(start, items.map(normalize));
    }
  }

  function push(this: Y.Array<T>, ...items: T[]): number {
    // turn push into Y.Array.insert
    yObj.insert(yObj.length, items.map(normalize));
    return yObj.length;
  }

  function map(
    this: Y.Array<T>,
    callback: (value: T, index: number, array: Y.Array<T>) => any,
    thisArg?: any
  ): any[] {
    // map over the Y.Array
    const result: any[] = [];
    for (let i = 0; i < yObj.length; i++) {
      const item = proxy(yObj.get(i), tracking, weakSelf);
      result.push(callback.call(thisArg, item, i, yObj));
    }
    return result;
  }

  /* Non mutation methods */
  function find(
    this: Y.Array<T>,
    predicate: (value: T, index: number, array: Y.Array<T>) => boolean,
    thisArg?: any
  ): T | undefined {
    // find an item in the Y.Array
    for (let i = 0; i < yObj.length; i++) {
      const item = proxy(yObj.get(i), tracking, weakSelf);
      if (predicate.call(thisArg, item, i, yObj)) {
        return item;
      }
    }
    return undefined;
  }

  function indexOf(
    this: Y.Array<T>,
    searchElement: T,
    fromIndex?: number
  ): number {
    // find the index of an item in the Y.Array
    for (let i = fromIndex || 0; i < yObj.length; i++) {
      const item = yObj.get(i);
      if (proxy(item) === searchElement) {
        return i;
      }
    }
    return -1;
  }

  const internals = {
    observer: null,
    weakParent: null,
    invalidate: () => {
      // Invalidate the cache when the array changes
      yToProxyCache.delete(yObj);
      if (internals.weakParent) {
        const parent = internals.weakParent.deref();
        if (parent !== undefined) {
          // If the parent is gone, remove the weak reference
          parent[INTERNALS].invalidate();
        }
      }
    },
  };

  const handler: ProxyHandler<Y.Array<T>> = {
    get(target: Y.Array<T>, prop, receiver) {
      switch (prop) {
        case YJS:
          // Return the underlying YJS object
          return target;
        case INTERNALS:
          // Return internal properties (eg, observer)
          return internals;
        case "toString":
          return () => JSON.stringify(target.toJSON());
        case "toJSON":
          return () => target.toJSON();
        case Symbol.toPrimitive:
          return (hint: string) =>
            hint === "string" ? JSON.stringify(target.toJSON()) : target; // for "number" / "default" hints
        case "splice":
          return splice;
        case "push":
          return push;
        case "find":
          return find;
        case "length":
          return target.length;
        case "indexOf":
          return indexOf;
        case "map":
            return map;
      }
      // pass through built-ins & symbols untouched
      if (typeof prop === "symbol" || prop in Object.prototype) {
        return Reflect.get(target, prop, receiver);
      }

      // arrays: numeric indexes & length
      const idx = Number(prop);
      const val = target.get(idx);
      // recurse for nested Y types
      return proxy(val, tracking, weakSelf);
    },

    set(target: Y.Array<T>, prop, value) {
      // arrays
      if (prop === "length") throw new Error("Cannot set length of Y.Array");
      const idx = Number(prop);
      if (!Number.isInteger(idx))
        throw new TypeError("Y.Array keys must be numeric");
      target.delete(idx); // idempotent if not present
      target.insert(idx, [normalize(value)]);
      console.log("set", idx, value);
      return true;
    },

    deleteProperty(target: Y.Array<T>, prop) {
      target.delete(Number(prop));
      return false;
    },

    ownKeys(target: Y.Array<T>) {
      return Array.from({ length: target.length }, (_, i) => i.toString());
    },
    has(target, prop) {
      const idx = Number(prop);
      return idx < target.length;
    },
    getOwnPropertyDescriptor() {
      // Required so that Object.keys / for…in work
      return { enumerable: true, configurable: true };
    },
  };

  const proxySelf = new Proxy(yObj, handler);
  const weakSelf = new WeakRef<any>(proxySelf);
  return proxySelf; // return the proxy
}

const yToProxyCache = new WeakMap<Y.AbstractType<any>, any>();

export function proxy(val: any, tracking: boolean = false, weakParent?: WeakRef<any>) {
  // Check the cache first
  let proxyVal;
  if (!(val instanceof Y.AbstractType)) {
    // If it's not a YJS type, return the value directly
    return val;
  } else if (yToProxyCache.has(val)) {
    // If it's a YJS type, check the cache
    proxyVal = yToProxyCache.get(val);
  } else {
    // Create and store the proxy in the cache
    proxyVal =
      val instanceof Y.Map
        ? MapProxy(val, tracking)
        : val instanceof Y.Array
        ? ArrayProxy(val, tracking)
        : val;
    if (val instanceof Y.AbstractType) {
      yToProxyCache.set(val, proxyVal);
    }
    proxyVal[INTERNALS].weakParent = weakParent;
  }

  if (tracking && !proxyVal[INTERNALS].observer) {
    // If tracking is enabled, observe changes
    const observer = (event, transaction) => {
      proxyVal[INTERNALS].invalidate();
    };
    val.observe(observer);
  }

  return proxyVal;
}



/* ---------- Usage example ---------- */

/*
console.clear();

const ydoc = new Y.Doc();
const yroot = ydoc.getMap("root");
const root = MapProxy(yroot, true);

yroot.observeDeep((events) =>
  console.log(
    events.map((x) => ({
      path: x.path,
      keys: JSON.stringify(x.keys),
    }))
  )
);

console.log("setting ada 32 obj as root.user");
root.user = { name: "Ada", age: 32 }; // promoted to nested Y.Map
console.log("setting {} as root.todo");
root.todo = {}; // promoted to Y.Array
console.log("setting some text as root.todo.tag");
root.todo.tag = "Build CRDT demo";
console.log(JSON.stringify(root.todo.tag));

root.todo.tags = ["demo", "crdt", "yjs"]; // promoted to Y.Array
console.log("tags", JSON.stringify(root.todo.tags));

root.todo.mymap = { a: 1, b: 2 }; // promoted to Y.Map

// insert one item at the second position in tags (tags is a standard Array)
root.todo.tags.splice(1, 0, "pret"); // inserts "yjs" at index 1
console.log("AUTO SAME PROXY?", root.todo.tags === root.todo.tags);
console.log(
  "AUTO SAME YJS  ?",
  yroot.get("user").get("tags") === yroot.get("user").get("tags")
);

const oldTodoProxy = root.todo;
const oldTagsProxy = root.todo.tags;
const oldMyMapProxy = root.todo.mymap;
const oldTagsYjs = yroot.get("todo").get("tags");
root.todo.tags[2] = "new tag !";
console.log("SAME YJS  ?", oldTagsYjs === yroot.get("todo").get("tags"));
console.log("SAME PROXY root.todo.tags? ", oldTagsProxy === root.todo.tags);
console.log("SAME PROXY root.todo?      ", oldTodoProxy === root.todo);
console.log("SAME PROXY root.todo.mymap?", oldMyMapProxy === root.todo.mymap);
console.log(JSON.stringify(root.todo.tags));

console.log("yjs loc", root.todo.tags.indexOf("yjs")); // find item in Y.Array
*/
