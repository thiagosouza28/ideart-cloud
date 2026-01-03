import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const redirectToRecovery = () => {
  const { pathname, search, hash } = window.location;
  const isRecovery =
    search.includes("type=recovery") ||
    hash.includes("type=recovery") ||
    search.includes("code=") ||
    hash.includes("access_token=");

  if (isRecovery && pathname !== "/alterar-senha") {
    const query = search || "";
    const fragment = hash || "";
    window.location.replace(`/alterar-senha${query}${fragment}`);
    return true;
  }
  return false;
};

if (!redirectToRecovery()) {
  createRoot(document.getElementById("root")!).render(<App />);
}

createRoot(document.getElementById("root")!).render(<App />);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("Service worker registration failed:", error);
    });
  });
}
