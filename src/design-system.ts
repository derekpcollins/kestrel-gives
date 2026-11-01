// The /design-system gallery: draws the icons from the one icon source and wires the
// live demos. Not loaded by the app.
import { enhanceDemoBar } from "./components/demo-bar.ts";
import { enhanceSiteHeader } from "./components/disclosure.ts";
import { enableWhenChosen, enhanceForm } from "./components/forms.ts";
import { hydrateIcons } from "./components/icons.ts";
import { showToast } from "./components/toast.ts";
import { createUploader } from "./components/uploader.ts";

hydrateIcons();

// Live specimens; [data-static] ones show a fixed state (menu open) and stay as drawn.
document.querySelectorAll<HTMLElement>(".site-header:not([data-static])").forEach(enhanceSiteHeader);
document.querySelectorAll<HTMLElement>("[data-demo-bar]").forEach(enhanceDemoBar);
document.addEventListener("demo:restore", () => showToast("In the app, this opens a confirmation dialog first (stage C2)."));

document.querySelector("[data-demo-toast]")?.addEventListener("click", () => {
  showToast("Bid placed. You're the top bidder.", { tone: "success" });
});

// The submit-an-item demo: the sale type unlocks the rest (SPEC §7.2) and picks which
// price fields apply.
const form = document.querySelector<HTMLFormElement>("#demo-form");
if (form) {
  const rest = form.querySelector<HTMLFieldSetElement>("#demo-rest")!;
  const auction = form.querySelector<HTMLFieldSetElement>("#demo-auction")!;
  const instant = form.querySelector<HTMLFieldSetElement>("#demo-instant")!;
  enableWhenChosen(form, "sale-type", rest);
  form.addEventListener("change", () => {
    const type = form.querySelector<HTMLInputElement>('input[name="sale-type"]:checked')?.value;
    auction.hidden = auction.disabled = type !== "auction";
    instant.hidden = instant.disabled = type !== "instant";
  });
  form.querySelectorAll<HTMLElement>("[data-uploader]").forEach(createUploader);
  enhanceForm(form, {
    onValid: () => showToast("Looks good. In the app, this would submit your item.", { tone: "success" }),
  });
}
