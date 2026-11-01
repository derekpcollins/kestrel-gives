// The /design-system gallery: draws the icons from the one icon source and wires the
// live demos. Not loaded by the app.
import { hydrateIcons } from "./components/icons.ts";
import { showToast } from "./components/toast.ts";

hydrateIcons();

document.querySelector("[data-demo-toast]")?.addEventListener("click", () => {
  showToast("Bid placed. You're the top bidder.", { tone: "success" });
});
