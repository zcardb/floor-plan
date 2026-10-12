import { createRoot } from "react-dom/client";
import "./i18n/config";
import { bootstrapGeneratedSiteAnalytics } from "./analytics.ts";
import App from "./App.tsx";
import { installStaleBuildHandler } from "./lib/staleBuild";
import "./index.css";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root container #root was not found.");
}

bootstrapGeneratedSiteAnalytics();
installStaleBuildHandler();

createRoot(container).render(<App />);
