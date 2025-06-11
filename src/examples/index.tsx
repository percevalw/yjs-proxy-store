import React, { useCallback } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { proxy, useStore } from "../lib";

import * as Y from "yjs";

// State will be {
//  "todos": [{"text": "Buy milk", "done": false}, ...]
//  "tags": ["shopping", "errands", ...]
// }
const ydoc = new Y.Doc();
const yroot = ydoc.getMap("root");
const ytodos = yroot.set("todos", new Y.Array());
const ytags = yroot.set("tags", new Y.Array());
ytodos.push([new Y.Map()]);
// @ts-ignore
ytodos.get(0).set("text", "Buy milk");
// @ts-ignore
ytodos.get(0).set("done", false);
ytags.push(["shopping"]);

const storeProxy = proxy(yroot, true);

const useEventCallback = (callback) => {
    const callbackRef = React.useRef(callback);
    callbackRef.current = callback;

    return useCallback((...args) => {
        return callbackRef.current(...args);
    }, []);
};

const TodoItem = React.memo(({ todo }: any) => {
    const onToggle = useEventCallback(() => {
        todo.done = !todo.done;
    });

    return (
        <li>
            <input type="checkbox" checked={todo.done} onChange={onToggle} />
            {todo.text}
        </li>
    );
});

const TodosList = React.memo(() => {
    const store = useStore(storeProxy);
    return (
        <ul>
            {store.todos.map((todo, index) => (
                <TodoItem key={index} todo={todo} />
            ))}
        </ul>
    );
});

const TagsList = React.memo(({ tags }: any) => {
    return (
        <ul>
            {tags.map((tag, index) => (
                <li key={index}>{tag}</li>
            ))}
        </ul>
    );
});

const App = () => {
    const [input, setInput] = React.useState("");
    const store = useStore(storeProxy);

    const onClick = useEventCallback(() => {
        if (input.trim()) {
            storeProxy.todos.push({
                text: input,
                done: false,
            });
            setInput("");
        }
    });
    const onChange = useEventCallback((e) => {
        setInput(e.target.value);
    });
    const onKeyDown = useEventCallback((e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            onClick();
        }
    });
    return (
        <div>
            <h1>Todo List</h1>
            <div>
                <h2>Todos</h2>
                <TodosList/>
                <input type="text" value={input} onChange={onChange} onKeyDown={onKeyDown} placeholder="Add a new todo" />
                <button onClick={onClick}>Add Todo</button>
            </div>
            <div>
                <h2>Tags</h2>
                <TagsList tags={store.tags} />
                <button onClick={() => storeProxy.tags.push("New Tag")}>Add Tag</button>
            </div>
        </div>
    );
};

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);
