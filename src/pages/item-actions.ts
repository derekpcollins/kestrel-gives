// The item page's actions (SPEC §7.4, §7.5; DECISIONS #88, Stage 4D): the bid form and the buy
// button in the amount panel, each behind a confirmation dialog.
// - The bid field starts at the minimum and opens the phone's number pad (inputmode="numeric").
// - What someone typed survives the 30-second refresh. The field keeps following the minimum
//   until they type.
// - Results and refusals are announced through the page's live region and shown as a quiet
//   toast, so they're read once (DECISIONS #88).
// - A refusal about the amount (too low, or someone just bid) goes under the field with the
//   new minimum filled in. Anything else (bidding ended, sold out) redraws the panel, whose
//   note says why.
// - If the request itself fails, the dialog stays open with the reason, to try again.
import { confirmDialog } from "../components/dialog.ts";
import { el } from "../components/dom.ts";
import { MONEY_PATTERN, formatDollars, moneyProblem, parseWholeDollars } from "../components/form-rules.ts";
import { icon } from "../components/icons.ts";
import { showToast } from "../components/toast.ts";
import type { ActionAnswer, ItemAnswer, ItemDetail, RefusalAnswer } from "../items-api.ts";
import { actionFailure, bidDialogTitle, buyDialogTitle, dialogDetail, isAmountRefusal } from "./item-rules.ts";

export interface ActionHost {
  /** Draws an answer the server just gave (after a bid or purchase). */
  show(answer: ItemAnswer): void;
  /** Fetches and draws the item again (after a refusal). */
  reload(): Promise<void>;
  /** Says something through the page's live region. */
  announce(message: string): void;
  /** True while a dialog is open, so the 30-second refresh waits. */
  setActing(acting: boolean): void;
}

type Outcome = { kind: "done"; answer: ActionAnswer } | { kind: "refused"; refusal: RefusalAnswer };

const FIELD_ID = "bid-amount";

export function createActions(host: ActionHost) {
  /** What the bidder typed, kept across redraws; null follows the minimum. */
  let draft: string | null = null;
  /** The message under the bid field, kept across redraws until they type. */
  let fieldError: string | null = null;

  const focusAfter = (key: string) => {
    const target = document.querySelector<HTMLElement>(`[data-focus-key="${key}"]`) ?? document.querySelector<HTMLElement>("[data-item-panel]");
    target?.focus();
  };

  const finish = async (outcome: Outcome, focusKey: string) => {
    if (outcome.kind === "done") {
      draft = null;
      fieldError = null;
      host.show(outcome.answer);
      host.announce(outcome.answer.message);
      showToast(outcome.answer.message, { tone: "success", announce: false });
      focusAfter(focusKey);
      return;
    }
    const { refusal } = outcome;
    const amount = isAmountRefusal(refusal.code);
    // A race or a too-low bid refills the field with the new minimum; "not whole dollars" keeps what they typed.
    if (amount && refusal.code !== "not-whole-dollars") draft = null;
    fieldError = amount ? refusal.error : null;
    await host.reload();
    host.announce(refusal.error);
    showToast(refusal.error, { tone: "danger", announce: false });
    focusAfter(amount ? FIELD_ID : focusKey);
  };

  const run = async (options: { title: string; body: Node; confirmLabel: string; busyLabel: string; send: () => Promise<Outcome> }, focusKey: string) => {
    let outcome: Outcome | null = null;
    host.setActing(true);
    try {
      await confirmDialog({
        variant: "confirm", title: options.title, body: options.body, confirmLabel: options.confirmLabel, busyLabel: options.busyLabel,
        onConfirm: async () => { outcome = await options.send(); },
      });
    } finally {
      host.setActing(false);
    }
    if (outcome) await finish(outcome, focusKey);
  };

  const renderBid = (answer: ItemAnswer): HTMLElement => {
    const minimum = (answer.minimumBidCents ?? 0) / 100;
    const help = el("p", { className: "field__help", attrs: { id: `${FIELD_ID}-help` }, text: answer.bidHint ?? "" });
    const input = el("input", {
      className: "input input--money",
      attrs: {
        id: FIELD_ID, name: "amount", type: "text", inputmode: "numeric", pattern: MONEY_PATTERN, autocomplete: "off",
        required: "", "data-money": "", "data-min": String(minimum), "data-focus-key": FIELD_ID,
      },
    });
    input.value = draft ?? String(minimum);
    const field = el("div", { className: "field" },
      el("label", { className: "field__label", attrs: { for: FIELD_ID }, text: "Your bid" }),
      help,
      el("div", { className: "input-group" }, el("span", { className: "input-group__affix", attrs: { "aria-hidden": "true" }, text: "$" }), input));
    showFieldError(field, input, fieldError);

    input.addEventListener("input", () => {
      draft = input.value;
      if (fieldError) { fieldError = null; showFieldError(field, input, null); }
    });

    const form = el("form", { className: "bid-form", attrs: { novalidate: "", "aria-label": "Place a bid" } },
      field,
      el("button", { className: "btn bid-form__submit", attrs: { type: "submit", "data-focus-key": "place-bid" }, text: "Place bid" }));

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const problem = moneyProblem(input.value, { label: "your bid", min: minimum, required: true });
      if (problem) {
        fieldError = problem;
        showFieldError(field, input, problem);
        input.focus();
        return;
      }
      const amountCents = parseWholeDollars(input.value)! * 100;
      const { item } = answer;
      void run({
        title: bidDialogTitle(amountCents),
        body: dialogBody(item, "Your bid: ", amountCents, "Bids can't be taken back."),
        confirmLabel: "Place bid",
        busyLabel: "Placing bid…",
        send: () => post("/api/bids", { itemId: item.id, amountCents, seenHighBidCents: item.highBidCents }, actionFailure("bid")),
      }, "place-bid");
    });
    return form;
  };

  const renderBuy = (answer: ItemAnswer): HTMLElement => {
    const { item } = answer;
    const button = el("button", { className: "btn", attrs: { type: "button", "data-focus-key": "buy" }, text: "Buy one" });
    button.addEventListener("click", () => {
      void run({
        title: buyDialogTitle(item),
        body: dialogBody(item, "Price: ", item.priceCents ?? 0, "One per purchase. Purchases can't be taken back."),
        confirmLabel: "Buy",
        busyLabel: "Buying…",
        send: () => post("/api/purchases", { itemId: item.id }, actionFailure("buy")),
      }, "buy");
    });
    return button;
  };

  return {
    /** The panel's controls for this answer: the bid form, the buy button, or nothing. */
    render(answer: ItemAnswer, action: "bid" | "buy" | null): HTMLElement | null {
      if (action === null) { draft = null; fieldError = null; return null; }
      return action === "bid" ? renderBid(answer) : renderBuy(answer);
    },
  };
}

/** The dialog's item summary (cover photo, title, where it stands), then the amount and a note. */
function dialogBody(item: ItemDetail, amountLabel: string, amountCents: number, note: string): Node {
  const cover = item.photos[0]?.url;
  const wrap = document.createDocumentFragment();
  wrap.append(
    el("div", { className: "dialog__item" },
      cover ? el("img", { className: "dialog__item-thumb", attrs: { src: cover, alt: "" } }) : el("span", { className: "dialog__item-thumb", attrs: { "aria-hidden": "true" } }),
      el("div", {},
        el("p", { className: "dialog__item-title", text: item.title }),
        el("p", { className: "item-tile__detail", text: dialogDetail(item) }))),
    el("p", {}, amountLabel, el("span", { className: "dialog__amount", text: formatDollars(amountCents / 100) })),
    el("p", { text: note }));
  return wrap;
}

/** Sends a bid or purchase. A refusal closes the dialog; no answer or a server error stays in it. */
async function post(url: string, body: unknown, failure: string): Promise<Outcome> {
  let response: Response;
  try {
    response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error(failure);
  }
  const data = (await response.json().catch(() => null)) as ActionAnswer | RefusalAnswer | null;
  if (response.ok && data?.ok) return { kind: "done", answer: data };
  if (response.status >= 400 && response.status < 500 && data && data.ok === false && data.code) return { kind: "refused", refusal: data };
  throw new Error(failure);
}

/** Shows or clears the message under the bid field, linked to the input (DESIGN-SYSTEM.md › Form field). */
function showFieldError(field: HTMLElement, input: HTMLInputElement, message: string | null): void {
  field.querySelector(".field__message--error")?.remove();
  const described = [`${FIELD_ID}-help`];
  if (message) {
    field.classList.add("field--error");
    input.setAttribute("aria-invalid", "true");
    field.append(el("p", { className: "field__message field__message--error", attrs: { id: `${FIELD_ID}-error` } }, icon("alert", { size: "sm" }), message));
    described.push(`${FIELD_ID}-error`);
  } else {
    field.classList.remove("field--error");
    input.removeAttribute("aria-invalid");
  }
  input.setAttribute("aria-describedby", described.join(" "));
}
