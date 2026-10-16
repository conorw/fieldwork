export interface ToastItem {
  id: number;
  severity: "success" | "error" | "info" | "warn";
  summary: string;
  detail: string;
  life: number;
}

let items = $state<ToastItem[]>([]);
let nextId = 1;

export function addToast(options: {
  severity?: ToastItem["severity"];
  summary?: string;
  detail?: string;
  life?: number;
}) {
  const item: ToastItem = {
    id: nextId++,
    severity: options.severity || "info",
    summary: options.summary || "",
    detail: options.detail || "",
    life: options.life ?? 4000,
  };
  items.push(item);
  setTimeout(() => {
    items = items.filter((toast) => toast.id !== item.id);
  }, item.life);
}

export function toastItems() {
  return items;
}
