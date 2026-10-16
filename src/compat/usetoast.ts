import { addToast } from "../lib/ui/toasts.svelte";

export function useToast() {
  return { add: addToast };
}
