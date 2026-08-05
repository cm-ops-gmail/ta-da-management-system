import React from "react";
import { createRoot } from "react-dom/client";
import { TenMSAuthProvider } from "@tenminuteschool/auth-admin-react";
import App from "./App.js";
import { auth } from "./lib/auth.js";
import "./index.css";

// Vite has no Server Components, so the provider is wrapped here directly
// rather than through a "use client" boundary component.
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TenMSAuthProvider auth={auth}>
      <App />
    </TenMSAuthProvider>
  </React.StrictMode>,
);
