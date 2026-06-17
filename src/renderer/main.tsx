import React from "react";
import { createRoot } from "react-dom/client";

function BootScreen() {
  return <div data-testid="boot">LacriTomato Mini</div>;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BootScreen />
  </React.StrictMode>,
);
