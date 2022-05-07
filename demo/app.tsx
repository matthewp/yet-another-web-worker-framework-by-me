import React, { useState, useCallback } from "react";
import { WW } from '../src/worker';

function MyApp() {
    const [count, setCount] = useState(0);
    const [color, setColor] = useState('red');
    const onClick = () => {
        setCount(count + 1);
        setColor(color === 'red' ? 'blue': 'red');
    };

    return (
        <div>
            Count: <span className={`count ${color}`}>{ count }</span>
            <br/>
            <button onClick={onClick}>Click me</button>
        </div>
    );
}


WW.render(<MyApp />, 'main');