import { createRoot } from "react-dom/client";
import "@/i18n/config";
import { bootstrapGeneratedSiteAnalytics } from "@/analytics";
import App from "@/app/app";
import { installStaleBuildHandler } from "@/lib/notify/stale-build";
import "./styles/index.css";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root container #root was not found.");
}

bootstrapGeneratedSiteAnalytics();
installStaleBuildHandler();

createRoot(container).render(<App />);
