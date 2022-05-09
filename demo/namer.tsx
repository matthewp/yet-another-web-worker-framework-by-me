import React, { useState } from 'react';

export default function() {
    const [first, setFirst] = useState('');
    const [last, setLast] = useState('');

    return (
        <form>
            <input type="text" placeholder="First name" onInput={ev => setFirst(ev.target.value)}></input>
            <input type="text" placeholder="Last name" onInput={ev => setLast(ev.target.value)}></input>
            <output name="output">{first + ' ' + last}</output>
        </form>
    );
}