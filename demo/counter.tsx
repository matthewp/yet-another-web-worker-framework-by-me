import React, { useState } from "react";
import './styles/counter.css';

export default function Counter() {
    const [count, setCount] = useState(0);
    const [color, setColor] = useState("red");
    const toggleColor = () => setColor(color === "red" ? "blue" : "red");
    const increment = () => {
      setCount(count + 1);
      toggleColor();
    };
    const decrement = () => {
        if(count > 0) {
          setCount(count - 1);
          toggleColor();
        }
    }
  
    return (
      <div>
        Count: <span data-color={color} className="count">{count}</span>
        <br />
        <button onClick={increment}>Increment ➕</button>
        <button onClick={decrement}>Decrement ➖</button>
      </div>
    );
  }