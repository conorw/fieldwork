import { compile } from "tailwindcss";
import fs from "node:fs";

const entry = fs.readFileSync("src/style.css", "utf8");
const compiler = await compile(entry, {
  base: process.cwd(),
  loadStylesheet: async (id) => {
    if (id === "tailwindcss") {
      return {
        base: "node_modules/tailwindcss",
        content: fs.readFileSync("node_modules/tailwindcss/index.css", "utf8"),
      };
    }
    return { base: process.cwd(), content: "" };
  },
});

const candidates = [
  "bg-surface-50",
  "bg-surface-0",
  "text-surface-600",
  "border-surface-200",
  "text-primary-600",
  "bg-gray-100",
  "bg-black/50",
  "bg-opacity-50",
];
const out = compiler.build(candidates);
for (const c of candidates) {
  const escaped = c.replace(/([/.])/g, "\\$1");
  console.log(c.padEnd(22), out.includes("." + escaped) ? "EMITTED" : "MISSING");
}
