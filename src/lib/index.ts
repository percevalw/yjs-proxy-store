import * as Y from "yjs";
import { useSyncExternalStore } from "use-sync-external-store/shim";

// Symbols
export const YJS = Symbol("YJS");
export const INTERNALS = Symbol("INTERNALS");

function normalize(val) {
    // If the user puts in a plain object → convert to Y.Map for deep sync
    if (Array.isArray(val)) {
        const yArray = new Y.Array();
        yArray.insert(0, val.map(normalize));
        return yArray;
    } else if (val && typeof val === "object" && !(val instanceof Y.AbstractType)) {
        const yMap = new Y.Map();
        Object.entries(val).forEach(([k, v]) => yMap.set(k, normalize(v)));
        return yMap;
    }
    return val;
}

/* Base proxy to access and mutate Y.Map and Y.Array objects */
function MapProxy(yObj: any) {
    if (!(yObj instanceof Y.AbstractType)) {
        throw new TypeError("yProxy() expects a Y.Map or Y.Array");
    }

    const MapProxyHandler: ProxyHandler<{}> = {
        get(target, prop, receiver) {
            switch (prop) {
                case YJS:
                    // Return the underlying YJS object
                    return yObj;
                case INTERNALS:
                    // Return internal properties (eg, observer)
                    // @ts-ignore
                    return yObj.internals;
                case "toString":
                    return () => JSON.stringify(yObj.toJSON());
                case "toJSON":
                    return () => {
                        if ((yObj as any).json === undefined) {
                            (yObj as any).json = yObj.toJSON();
                        }
                        return (yObj as any).json;
                    };
                case Symbol.toPrimitive:
                    return (hint: string) => (hint === "string" ? JSON.stringify(yObj.toJSON()) : yObj); // for "number" / "default" hints
            }
            if (typeof prop === "symbol" || prop in Object.prototype) {
                return Reflect.get(yObj, prop, receiver);
            }
            const val = (yObj as any).get(prop);
            return proxy(val);
        },

        set(target, prop: string, value) {
            (yObj as any).set(prop, normalize(value));
            return true;
        },

        deleteProperty(target, prop: string) {
            (yObj as any).delete(prop);
            return true;
        },

        ownKeys(target) {
            return Array.from((yObj as any).keys()) as string[];
        },
        has(target, prop: string) {
            return (yObj as any).has(prop);
        },
        getOwnPropertyDescriptor(target, name) {
            // Required so that Object.keys / for…in work
            return {
                //use a logical set of descriptors:
                enumerable: true,
                configurable: true,
            };
        },
    };

    return new Proxy({}, MapProxyHandler); // return the proxy
}

function ArrayProxy<T>(yObj: Y.Array<T>) {
    if (!(yObj instanceof Y.AbstractType)) {
        throw new TypeError("yProxy() expects a Y.Map or Y.Array");
    }

    /* Mutation methods */
    function splice<T>(this: Y.Array<T>, start: number, deleteCount?: number, ...items: T[]): void {
        // turn splice into Y.Array.insert + Y.Array.delete
        yObj.delete(start, deleteCount || 0);
        if (items.length > 0) {
            yObj.insert(start, items.map(normalize));
        }
    }

    function push<T>(this: Y.Array<T>, ...items: T[]): number {
        // turn push into Y.Array.insert
        yObj.insert(yObj.length, items.map(normalize));
        return yObj.length;
    }

    function pop<T>(this: Y.Array<T>): T | undefined {
        if (yObj.length === 0) return undefined;
        const idx = yObj.length - 1;
        const value = proxy(yObj.get(idx)) as any;
        yObj.delete(idx, 1);
        return value as T;
    }

    function shift<T>(this: Y.Array<T>): T | undefined {
        if (yObj.length === 0) return undefined;
        const value = proxy(yObj.get(0)) as any;
        yObj.delete(0, 1);
        return value as T;
    }

    function unshift<T>(this: Y.Array<T>, ...items: T[]): number {
        yObj.insert(0, items.map(normalize));
        return yObj.length;
    }

    function map<T>(
        this: Y.Array<T>,
        callback: (value: T, index: number, array: Y.Array<T>) => any,
        thisArg?: any,
    ): any[] {
        // map over the Y.Array
        const result: any[] = [];
        for (let i = 0; i < yObj.length; i++) {
            const item = proxy(yObj.get(i));
            result.push(callback.call(thisArg, item, i, this));
        }
        return result;
    }

    function filter<T>(
        this: Y.Array<T>,
        predicate: (value: T, index: number, array: Y.Array<T>) => boolean,
        thisArg?: any,
    ): T[] {
        // filter the Y.Array and return a plain array
        const result: T[] = [];
        for (let i = 0; i < yObj.length; i++) {
            const item = proxy(yObj.get(i));
            if (predicate.call(thisArg, item, i, this)) {
                result.push(item as any);
            }
        }
        return result;
    }

    /* Non mutation methods */
    function find<T>(
        this: Y.Array<T>,
        predicate: (value: T, index: number, array: Y.Array<T>) => boolean,
        thisArg?: any,
    ): T | undefined {
        // find an item in the Y.Array
        for (let i = 0; i < yObj.length; i++) {
            const item = proxy(yObj.get(i));
            if (predicate.call(thisArg, item, i, this)) {
                return item;
            }
        }
        return undefined;
    }

    function indexOf<T>(this: Y.Array<T>, searchElement: T, fromIndex?: number): number {
        // find the index of an item in the Y.Array
        for (let i = fromIndex || 0; i < yObj.length; i++) {
            const item = yObj.get(i);
            if (proxy(item) === searchElement) {
                return i;
            }
        }
        return -1;
    }

    function extend<T>(this: Y.Array<T>, items: T[]): void {
        // turn extend into Y.Array.insert
        yObj.insert(yObj.length, items.map(normalize));
    }

    const handler: ProxyHandler<[]> = {
        get(target: [], prop, receiver) {
            switch (prop) {
                case YJS:
                    // Return the underlying YJS object
                    return yObj;
                case INTERNALS:
                    // Return internal properties (eg, observer)
                    // @ts-ignore
                    return yObj.internals;
                case "toString":
                    return () => JSON.stringify(yObj.toJSON());
                case "toJSON":
                    return () => {
                        if ((yObj as any).json === undefined) {
                            (yObj as any).json = yObj.toJSON();
                        }
                        return (yObj as any).json;
                    };
                case Symbol.toPrimitive:
                    return (hint: string) => (hint === "string" ? JSON.stringify(yObj.toJSON()) : yObj); // for "number" / "default" hints
                case "splice":
                    return splice;
                case "push":
                    return push;
                case "pop":
                    return pop;
                case "shift":
                    return shift;
                case "unshift":
                    return unshift;
                case "find":
                    return find;
                case "length":
                    return yObj.length;
                case "indexOf":
                    return indexOf;
                case "map":
                    return map;
                case "filter":
                    return filter;
                case Symbol.iterator:
                    return function* () {
                        for (let i = 0; i < yObj.length; i++) {
                            yield proxy(yObj.get(i));
                        }
                    };
            }
            // pass through built-ins & symbols untouched
            if (typeof prop === "symbol" || prop in Object.prototype) {
                return Reflect.get(yObj, prop, receiver);
            }

            // arrays: numeric indexes & length
            const idx = Number(prop);
            const val = yObj.get(idx);
            // recurse for nested Y types
            return proxy(val);
        },
        set(target: [], prop, value) {
            // arrays
            if (prop === "length") throw new Error("Cannot set length of Y.Array");
            const idx = Number(prop);
            if (!Number.isInteger(idx)) throw new TypeError("Y.Array keys must be numeric");
            yObj.delete(idx); // idempotent if not present
            yObj.insert(idx, [normalize(value)]);
            return true;
        },
        deleteProperty(target: [], prop) {
            yObj.delete(Number(prop));
            return false;
        },

        has(target, prop) {
            const idx = Number(prop);
            return idx < yObj.length;
        },
        getOwnPropertyDescriptor(target, name) {
            // Required so that Object.keys / for…in work
            if (name === "length") {
                return {
                    value: yObj.length,
                    writable: true,
                    enumerable: false,
                    configurable: false,
                };
            }
            const idx = Number(name);
            if (Number.isInteger(idx) && idx >= 0 && idx < yObj.length) {
                return {
                    value: proxy(yObj.get(idx)),
                    writable: true,
                    enumerable: true,
                    configurable: true,
                };
            }
            return {
                configurable: true,
                enumerable: true,
            };
        },

        ownKeys() {
            const keys = [] as string[];
            for (let i = 0; i < yObj.length; i++) {
                keys.push(String(i));
            }
            keys.push("length");
            return keys;
        },
    };

    return new Proxy([], handler); // return the proxy
}

const yToProxyCache = new WeakMap<Y.AbstractType<any>, any>();

function proxy(val: any) {
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
        proxyVal = val instanceof Y.Map ? MapProxy(val) : val instanceof Y.Array ? ArrayProxy(val) : val;
        if (val instanceof Y.AbstractType) {
            yToProxyCache.set(val, proxyVal);
        }

        let internals;
        if (!(val as any).internals) {
            internals = {
                observer: null,
                weakParent: null as WeakRef<any> | null,
                listeners: new Set<() => void>(),
                revoked: false,
                revoke_proxies: () => {
                    console.info("Revoking proxies for", val);
                    if (internals.revoked) {
                        console.error("Already revoked");
                    }
                    internals.revoked = true;
                    // Invalidate the cache when the array changes
                    yToProxyCache.delete(val);
                    internals.listeners.forEach((cb) => cb());
                    val.unobserve(internals.observer);
                    (val as any).internals.observer = null;
                    if (val.parent && (val.parent as any).internals) {
                        (val.parent as any).internals.revoke_proxies();
                    }
                },
                subscribe(cb: () => void) {
                    internals.listeners.add(cb);
                    return () => internals.listeners.delete(cb);
                },
            };
            // @ts-ignore
            val.internals = internals;
        } else {
            internals = (val as any).internals;
        }
    }
    if (tracking.enabled && !(val as any).internals.observer) {
        const observer = (event, transaction) => {
            (val as any).internals.revoke_proxies();
        };
        (val as any).internals.observer = observer;
        val.observe(observer);
    }

    return proxyVal;
}

export const makeStore = proxy;

const tracking = { enabled: true };

export function setTracking(flag: boolean) {
    tracking.enabled = flag;
}

export function useStore<T extends object>(store: T): T {
    const subscribe = (cb: () => void) => {
        return proxy(store[YJS])[INTERNALS].subscribe(cb);
    };
    const getSnapshot = () => proxy(store[YJS]);
    return useSyncExternalStore(subscribe, getSnapshot);
}

// TODO, decorator ? to toggle a "tracking" mode, where access to stored trigger observer registration
//       before a component renders, and disable the mode after the function has run
