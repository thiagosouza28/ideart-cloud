import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { defineCustomElements } from "jeep-sqlite/loader";
import { localDb } from "./lib/localDb";
import { SyncManager } from "./services/sync";

const rootElement = document.getElementById("root");

async function bootstrap() {
  // Ensure the web sqlite component is registered (required by @capacitor-community/sqlite on web)
  if (typeof window !== 'undefined') {
    defineCustomElements(window);
  }

  // Initialize offline services
  try {
    await localDb.initialize();
    await SyncManager.initialize();
    console.log("Offline services initialized.");
  } catch (error) {
    console.error("Failed to initialize offline services:", error);
  }

  if (rootElement) {
    createRoot(rootElement).render(<App />);
  }
}

void bootstrap();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("Service worker registration failed:", error);
    });
  });
}
