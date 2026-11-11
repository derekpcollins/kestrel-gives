// The /design-system gallery: draws the icons from the one icon source and wires the
// live demos. Not loaded by the app.
import { enhanceCarousel } from "./components/carousel.ts";
import { enhanceDemoBar } from "./components/demo-bar.ts";
import { confirmDialog, type ConfirmOptions } from "./components/dialog.ts";
import { enhanceSiteHeader } from "./components/disclosure.ts";
import { enableWhenChosen, enhanceForm } from "./components/forms.ts";
import { formatDollars } from "./components/form-rules.ts";
import { REASON_MAX, reasonProblem } from "./components/admin-rules.ts";
import { hydrateIcons } from "./components/icons.ts";
import { renderItemTile, type TileView } from "./components/item-tile.ts";
import type { TileContext } from "./components/item-tile-rules.ts";
import { enhanceTableScroll } from "./components/table.ts";
import { showToast } from "./components/toast.ts";
import { createUploader } from "./components/uploader.ts";
import { openWelcome } from "./components/welcome.ts";

hydrateIcons();

// Live specimens; [data-static] ones show a fixed state (menu open) and stay as drawn.
document.querySelectorAll<HTMLElement>(".site-header:not([data-static])").forEach(enhanceSiteHeader);
document.querySelectorAll<HTMLElement>("[data-demo-bar]").forEach((bar) => enhanceDemoBar(bar));

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

// ---------- Stage C2 ----------

// Sample event: settings and dates as the app will have them. Copy is computed from these.
const settings = { name: "Kestrel Gives 2026", increment: 5 };
const now = new Date();
const days = (n: number) => new Date(now.getTime() + n * 86_400_000);
const phases: Record<string, TileContext> = {
  submission: { phase: "submission", now, biddingOpens: days(6), biddingCloses: days(10) },
  live: { phase: "live", now, biddingOpens: days(-2), biddingCloses: days(3) },
  liveClosing: { phase: "live", now, biddingOpens: days(-4), biddingCloses: days(0.5) },
  ended: { phase: "ended", now, biddingOpens: days(-10), biddingCloses: days(-2) },
};

const tiles: Record<string, [TileView, TileContext][]> = {
  submission: [
    [{ type: "auction", title: "Pottery class for two", href: "#item-tiles", startingBid: 30, bidCount: 0 }, phases.submission!],
    [{ type: "instant", title: "Homemade hot sauce trio", href: "#item-tiles", price: 20, remaining: 12 }, phases.submission!],
  ],
  "live-auction": [
    [{ type: "auction", title: "Custom pet portrait", href: "#item-tiles", startingBid: 40, bidCount: 0 }, phases.live!],
    [{ type: "auction", title: "Lakeside Cabin Weekend", href: "#item-tiles", startingBid: 100, topBid: 240, bidCount: 6 }, phases.live!],
    [{ type: "auction", title: "Guitar lessons, four weeks", href: "#item-tiles", startingBid: 50, topBid: 85, bidCount: 3, viewerIsTopBidder: true }, phases.live!],
    [{ type: "auction", title: "Sourdough starter and a loaf a month", href: "#item-tiles", startingBid: 25, topBid: 60, bidCount: 4, viewerHasBid: true }, phases.live!],
    [{ type: "auction", title: "Bike tune-up at your desk", href: "#item-tiles", startingBid: 20, topBid: 35, bidCount: 2 }, phases.liveClosing!],
  ],
  "live-instant": [
    [{ type: "instant", title: "Hand-knit scarf", href: "#item-tiles", price: 45, remaining: 6 }, phases.live!],
    [{ type: "instant", title: "Homemade hot sauce trio", href: "#item-tiles", price: 20, remaining: 2 }, phases.live!],
    [{ type: "instant", title: "Lemon squares, a dozen", href: "#item-tiles", price: 15, remaining: 0 }, phases.live!],
  ],
  ended: [
    [{ type: "auction", title: "Guitar lessons, four weeks", href: "#item-tiles", startingBid: 50, topBid: 110, bidCount: 7, viewerIsTopBidder: true }, phases.ended!],
    [{ type: "auction", title: "Lakeside Cabin Weekend", href: "#item-tiles", startingBid: 100, topBid: 310, bidCount: 9, viewerHasBid: true }, phases.ended!],
    [{ type: "auction", title: "Custom pet portrait", href: "#item-tiles", startingBid: 40, bidCount: 0 }, phases.ended!],
    [{ type: "instant", title: "Lemon squares, a dozen", href: "#item-tiles", price: 15, remaining: 0 }, phases.ended!],
  ],
  cancelled: [
    [{ type: "auction", title: "Concert tickets", href: "#item-tiles", startingBid: 60, topBid: 75, bidCount: 2, viewerHasBid: true, cancelled: true }, phases.live!],
  ],
};
for (const grid of document.querySelectorAll<HTMLUListElement>("[data-tiles]")) {
  for (const [item, ctx] of tiles[grid.dataset.tiles ?? ""] ?? []) grid.append(renderItemTile(item, ctx));
}

document.querySelectorAll<HTMLElement>("[data-carousel]").forEach(enhanceCarousel);
document.querySelectorAll<HTMLElement>("[data-table-scroll]").forEach(enhanceTableScroll);

// Live dialogs. Requests are simulated (about a second).
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const bidItem = { title: "Lakeside Cabin Weekend", topBid: 60, bidCount: 4 };
function bidBody(amount: number): Node {
  const wrap = document.createDocumentFragment();
  const item = document.createElement("div");
  item.className = "dialog__item";
  item.innerHTML = '<span class="dialog__item-thumb" aria-hidden="true"></span><div><p class="dialog__item-title"></p><p class="item-tile__detail"></p></div>';
  item.querySelector(".dialog__item-title")!.textContent = bidItem.title;
  item.querySelector(".item-tile__detail")!.textContent = `Top bid ${formatDollars(bidItem.topBid)} · ${bidItem.bidCount} bids`;
  const yours = document.createElement("p");
  yours.append("Your bid: ");
  const amt = document.createElement("span");
  amt.className = "dialog__amount";
  amt.textContent = formatDollars(amount);
  yours.append(amt);
  const note = document.createElement("p");
  note.textContent = "Bids can't be taken back.";
  wrap.append(item, yours, note);
  return wrap;
}
const minimumBid = bidItem.topBid + settings.increment;
const dialogs: Record<string, () => ConfirmOptions> = {
  bid: () => ({ variant: "confirm", title: `Place a ${formatDollars(minimumBid)} bid?`, body: bidBody(minimumBid), confirmLabel: "Place bid", busyLabel: "Placing bid…",
    onConfirm: async () => { await wait(1000); showToast(`Bid placed. You're the top bidder at ${formatDollars(minimumBid)}.`, { tone: "success" }); } }),
  "bid-fail": () => ({ variant: "confirm", title: `Place a ${formatDollars(minimumBid)} bid?`, body: bidBody(minimumBid), confirmLabel: "Place bid", busyLabel: "Placing bid…",
    onConfirm: async () => { await wait(1000); throw new Error(`Someone just bid ${formatDollars(minimumBid)}. The minimum is now ${formatDollars(minimumBid + settings.increment)}.`); } }),
  restore: () => ({ variant: "danger", title: "Restore demo data?", body: "Every item, bid, purchase, proof and email template goes back to the seeded demo. Changes made since then are lost.", confirmLabel: "Restore demo data", busyLabel: "Restoring…",
    onConfirm: async () => { await wait(1000); showToast("Demo data restored.", { tone: "success" }); } }),
  cancel: () => ({ variant: "danger", title: "Cancel this item?", body: `${bidItem.title} comes off the listings. Its page stays up, marked as cancelled, and everyone who bid sees it on their dashboard.`, confirmLabel: "Cancel item", cancelLabel: "Keep item", busyLabel: "Cancelling…",
    onConfirm: async () => { await wait(1000); showToast("Item cancelled.", { tone: "success" }); } }),
  reject: () => ({ variant: "danger", title: "Reject Rosa Delgado's proof?", body: "Rosa will see your reason on Your Items and can upload a new proof.", confirmLabel: "Reject proof", busyLabel: "Rejecting…",
    reason: { label: "Reason (shown to Rosa)", help: `For example, "The screenshot doesn't show the amount." Up to ${REASON_MAX} characters.`, maxLength: REASON_MAX, check: reasonProblem },
    onConfirm: async () => { await wait(1000); showToast("Proof rejected. Rosa can upload a new one.", { tone: "success" }); } }),
  reset: () => ({ variant: "type-to-confirm", title: "Reset for next year?", body: `This deletes every item, photo, bid, purchase and proof from ${settings.name}. Users, charities, email templates and settings stay. This can't be undone.`, confirmText: settings.name, confirmLabel: "Reset for next year", busyLabel: "Resetting…",
    onConfirm: async () => { await wait(1000); showToast("Reset done. The event is ready for next year.", { tone: "success" }); } }),
};
document.addEventListener("click", (event) => {
  const trigger = (event.target as Element).closest<HTMLElement>("[data-demo-dialog]");
  const make = trigger && dialogs[trigger.dataset.demoDialog ?? ""];
  if (make) void confirmDialog(make());
});
document.addEventListener("demo:restore", () => void confirmDialog(dialogs.restore!()));
// The info variant is the welcome itself, from the row's button or a specimen's About this demo.
document.addEventListener("demo:about", () => void openWelcome());
document.querySelector("[data-demo-welcome]")?.addEventListener("click", () => void openWelcome());
