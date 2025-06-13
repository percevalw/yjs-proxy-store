/* eslint @typescript-eslint/no-explicit-any: "off", no-self-compare: "off" */
// Adapted from valtio-yjs

import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { makeStore, setTracking } from "../src/lib";

function makeStoreFromAny(obj: any) {
    const doc = new Y.Doc();
    const m = doc.getMap("map");
    const store = makeStore(m);
    store.obj = obj;
    return store.obj;
}

describe("makeStore", () => {
    it("simple map", async () => {
        const doc = new Y.Doc();
        const m = doc.getMap("map");

        const p = makeStore(m);
        expect(p.foo).toBe(undefined);

        m.set("foo", "a");
        expect(p.foo).toBe("a");

        p.foo = "b";
        expect(m.get("foo")).toBe("b");
    });

    it("simple map with initial values", async () => {
        const doc = new Y.Doc();
        const m = doc.getMap("map");
        m.set("bar", 1);
        const p = makeStore(m);
        p.foo = "a";
        expect(p.foo).toBe("a");
        expect(p.bar).toBe(1);
        expect(m.get("foo")).toBe("a");
        expect(m.get("bar")).toBe(1);

        m.set("foo", "b");
        expect(p.foo).toBe("b");

        p.bar = 2;
        expect(m.get("bar")).toBe(2);
    });

    it("simple map with null value", async () => {
        const doc = new Y.Doc();
        const m = doc.getMap("map");
        const p = makeStore(m);
        p.foo = null;

        expect(p.foo).toBe(null);
        expect(m.get("foo")).toBe(null);

        m.set("foo", "bar");
        expect(p.foo).toBe("bar");
        expect(m.get("foo")).toBe("bar");

        p.foo = null;
        expect(p.foo).toBe(null);
        expect(m.get("foo")).toBe(null);
    });

    it("nested map (from proxy)", async () => {
        const doc = new Y.Doc();
        const m = doc.getMap("map") as any;

        const p = makeStore(m);
        expect(p.foo).toBe(undefined);
        expect(m.get("foo")).toBe(undefined);

        p.foo = { bar: "a" };
        expect(p.foo.bar).toBe("a");
        expect(m.get("foo").get("bar")).toBe("a");

        m.get("foo").set("bar", "b");
        expect(p.foo.bar).toBe("b");
        expect(m.get("foo").get("bar")).toBe("b");
    });
    it("nested map (from y.map)", async () => {
        const doc = new Y.Doc();
        const m = doc.getMap("map") as any;

        const p = makeStore(m);
        expect(p.foo).toBe(undefined);
        expect(m.get("foo")).toBe(undefined);

        m.set("foo", new Y.Map());
        m.get("foo").set("bar", "a");
        expect(p?.foo?.bar).toBe("a");
        expect(m.get("foo").get("bar")).toBe("a");

        (p as any).foo.bar = "b";
        expect(p?.foo?.bar).toBe("b");
        expect(m.get("foo").get("bar")).toBe("b");
    });

    it("is a single transaction", async () => {
        const doc = new Y.Doc();
        const m = doc.getMap("root") as any;

        const listener = vi.fn();
        doc.on("update", listener);

        const p = makeStore(m);
        p.content = { foo: "a", bar: 5 };

        expect(listener).toBeCalledTimes(1);
    });
});

describe("makeStore array", () => {
    it("simple array", async () => {
        const doc = new Y.Doc();
        const a = doc.getArray<string>("arr");
        const p = makeStore(a);
        expect(p).toEqual([]);
        expect(a.toJSON()).toEqual([]);

        a.push(["a"]);
        expect(a.toJSON()).toEqual(["a"]);
        expect(p).toEqual(["a"]);

        p.push("b");
        expect(p).toEqual(["a", "b"]);
        expect(a.toJSON()).toEqual(["a", "b"]);
    });

    describe("simple array with various operations", () => {
        const doc = new Y.Doc();
        const a = doc.getArray<number>("arr");
        a.push([10, 11, 12, 13]);
        const p = makeStore(a);

        it("a push", async () => {
            a.push([20]);
            expect(a.toJSON()).toEqual([10, 11, 12, 13, 20]);
            expect(p).toEqual([10, 11, 12, 13, 20]);
        });

        it("p push", async () => {
            p.push(21);
            expect(p).toEqual([10, 11, 12, 13, 20, 21]);
            expect(a.toJSON()).toEqual([10, 11, 12, 13, 20, 21]);
        });

        it("a pop", async () => {
            a.delete(5, 1);
            expect(a.toJSON()).toEqual([10, 11, 12, 13, 20]);
            expect(p).toEqual([10, 11, 12, 13, 20]);
        });

        it("p pop", async () => {
            p.pop();
            expect(p).toEqual([10, 11, 12, 13]);
            expect(a.toJSON()).toEqual([10, 11, 12, 13]);
        });

        it("a unshift", async () => {
            a.unshift([9]);
            expect(a.toJSON()).toEqual([9, 10, 11, 12, 13]);
            expect(p).toEqual([9, 10, 11, 12, 13]);
        });

        it("p unshift", async () => {
            p.unshift(8);
            expect(p).toEqual([8, 9, 10, 11, 12, 13]);
            expect(a.toJSON()).toEqual([8, 9, 10, 11, 12, 13]);
        });

        it("a delete", async () => {
            a.delete(0, 1);
            expect(a.toJSON()).toEqual([9, 10, 11, 12, 13]);
            expect(p).toEqual([9, 10, 11, 12, 13]);
        });

        it("a shift", async () => {
            p.shift();
            expect(p).toEqual([10, 11, 12, 13]);
            expect(a.toJSON()).toEqual([10, 11, 12, 13]);
        });

        it("a replace", async () => {
            doc.transact(() => {
                a.delete(2, 1);
                a.insert(2, [99]);
            });
            expect(p).toEqual([10, 11, 99, 13]);
            expect(a.toJSON()).toEqual([10, 11, 99, 13]);
        });

        it("p replace", async () => {
            p[2] = 98;
            expect(p).toEqual([10, 11, 98, 13]);
            expect(a.toJSON()).toEqual([10, 11, 98, 13]);
        });

        it("p splice (delete+insert)", async () => {
            p.splice(2, 1, 97);
            expect(p).toEqual([10, 11, 97, 13]);
            expect(a.toJSON()).toEqual([10, 11, 97, 13]);
        });

        it("p splice (delete)", async () => {
            p.splice(1, 1);
            expect(p).toEqual([10, 97, 13]);
            expect(a.toJSON()).toEqual([10, 97, 13]);
        });

        it("p splice (insert)", async () => {
            p.splice(1, 0, 95, 96);
            expect(p).toEqual([10, 95, 96, 97, 13]);
            expect(a.toJSON()).toEqual([10, 95, 96, 97, 13]);
        });
    });
});

describe("makeStore nested todos", () => {
    it("deep nested list mutations", async () => {
        const doc = new Y.Doc();
        const listener = vi.fn();
        doc.on("update", listener);
        const root = doc.getMap("root") as any;
        root.set("state", new Y.Map());
        const state = root.get("state") as any;
        state.set("todos", new Y.Array());

        const todos = state.get("todos") as any;
        const p = makeStore(todos) as any;

        // add first todo via Yjs
        const todo1 = new Y.Map();
        todos.push([todo1]);
        todo1.set("title", "Buy milk");
        todo1.set("done", false);
        todo1.set("tags", new Y.Array());
        (todo1.get("tags") as any).push(["shopping", "urgent"]);

        expect(p.length).toBe(1);
        expect(p[0].title).toBe("Buy milk");
        expect(p[0].done).toBe(false);
        expect(p[0].tags).toEqual(["shopping", "urgent"]);

        // mutate via proxy
        p[0].title = "Buy oat milk";
        p[0].done = true;
        p[0].tags.push("healthy");

        expect(todos.get(0).get("title")).toBe("Buy oat milk");
        expect(todos.get(0).get("done")).toBe(true);
        expect(todos.get(0).get("tags").toJSON()).toEqual(["shopping", "urgent", "healthy"]);

        // mutate via Yjs
        todos.get(0).get("tags").insert(1, ["important"]);
        expect(p[0].tags).toEqual(["shopping", "important", "urgent", "healthy"]);

        // add second todo via proxy
        listener.mockClear();
        p.push({ title: "Read book", done: false, tags: ["leisure"] });
        expect(listener).toBeCalledTimes(1);

        expect(todos.length).toBe(2);
        expect(todos.get(1).get("title")).toBe("Read book");
        expect(todos.get(1).get("tags").toJSON()).toEqual(["leisure"]);

        // mutate second todo via Yjs
        todos.get(1).set("done", true);
        expect(p[1].done).toBe(true);
    });
});

describe("reference equality", () => {
    it("should maintain reference equality for the same non mutated object", async () => {
        const a = makeStoreFromAny({
            foo: "bar",
            nested: { baz: "qux" },
            arr: [1, 2, 3],
        });
        expect(a.nested === a.nested).toBe(true);
        expect(a.arr === a.arr).toBe(true);

        a.nested.baz = "new value";
        expect(a.arr === a.arr).toBe(true);
    });

    it("should not maintain reference equality for mutated objects", async () => {
        setTracking(true);
        const a = makeStoreFromAny({
            foo: "bar",
            nested: { baz: "qux" },
            arr: [1, 2, 3],
        });
        const originalNested = a.nested;
        a.nested.baz = "new value";
        expect(originalNested === a.nested).toBe(false);
    });
});

// Define property append on an array
// eslint-disable-next-line no-extend-native
Object.defineProperty(Array.prototype, "append", {
    value: function (item) {
        this.push(item);
    },
    writable: true,
    configurable: true,
});

describe("monkey patching", () => {
    it("support monkey patching", async () => {
        const a = makeStoreFromAny([{ foo: "bar" }, { baz: "qux" }]);
        expect(a.length).toBe(2);
        a.append({ newItem: "value" });
        expect(a.length).toBe(3);
    });
});
