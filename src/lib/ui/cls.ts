export function cls(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(cls).filter(Boolean).join(" ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, on]) => Boolean(on))
      .map(([key]) => key)
      .join(" ");
  }
  return "";
}

export function styleAttr(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item != null && item !== false)
      .map(([key, item]) => {
        const css = key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
        return `${css}:${item}`;
      })
      .join(";");
  }
  return "";
}
