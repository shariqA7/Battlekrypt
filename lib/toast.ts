// Tiny toast helper: call toast("message") from any client code; <Toaster /> (mounted once in the
// root layout) shows it. No provider needed, so it also works from plain event handlers.
export type ToastKind = "info" | "success" | "warning" | "error";
export interface ToastDetail {
  id: number;
  message: string;
  kind: ToastKind;
  ms: number;
}

export const TOAST_EVENT = "bk:toast";
let nextId = 1;

export function toast(message: string, kind: ToastKind = "info", ms = 7000) {
  if (typeof window === "undefined") return;
  const detail: ToastDetail = { id: nextId++, message, kind, ms };
  window.dispatchEvent(new CustomEvent<ToastDetail>(TOAST_EVENT, { detail }));
}
