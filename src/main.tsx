import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "leaflet/dist/leaflet.css";
import "./index.css";
import App from "./App";
import { APP_DESCRIPTION, APP_NAME, APP_TITLE } from "./config/branding";

document.title = APP_TITLE;
document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute("content", APP_DESCRIPTION);
document.querySelector<HTMLMetaElement>('meta[name="application-name"]')?.setAttribute("content", APP_NAME);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
