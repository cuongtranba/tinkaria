import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import { App } from "./client/app/App"
import { ThemeProvider } from "./client/hooks/useTheme"
import { installClientLogShipper } from "./client/lib/log-shipper"
import "./index.css"

// Observability (decision 0012): ship browser console logs + errors to the
// backend (/api/logs), which forwards to VictoriaLogs. Installed before render
// so early errors are captured. Safe no-op if the endpoint is unreachable.
installClientLogShipper()

const container = document.getElementById("root")

if (!container) {
  throw new Error("Missing #root")
}

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>
)

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js")
  })
}
