import React, { Fragment, useState } from "react";
import { WW } from "../src/worker";
import Header from './header';
import Counter from './counter';
import Namer from './namer';
import './styles/app.css';

function MyApp() {
  const [showNamer, setShowNamer] = useState(true);
  return (
    <Fragment>
        <Header />
        <main>
            <Counter />
            <button type="button" onClick={() => setShowNamer(false)}>Remove namer</button>
            {showNamer && <Namer />}
        </main>
    </Fragment>
  );
}

WW.render(<MyApp />, "#app");
