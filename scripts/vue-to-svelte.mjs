import { readdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { parse, NodeTypes } from "@vue/compiler-dom";

const UI = {
  Accordion: "$lib/ui/Accordion.svelte",
  AccordionTab: "$lib/ui/AccordionTab.svelte",
  Avatar: "$lib/ui/Avatar.svelte",
  Button: "$lib/ui/Button.svelte",
  Card: "$lib/ui/Card.svelte",
  Checkbox: "$lib/ui/Checkbox.svelte",
  Chip: "$lib/ui/Chip.svelte",
  ConfirmDialog: "$lib/ui/ConfirmDialog.svelte",
  Dialog: "$lib/ui/Dialog.svelte",
  Drawer: "$lib/ui/Drawer.svelte",
  Dropdown: "$lib/ui/Select.svelte",
  Image: "$lib/ui/Image.svelte",
  InlineMessage: "$lib/ui/InlineMessage.svelte",
  InputSwitch: "$lib/ui/InputSwitch.svelte",
  InputText: "$lib/ui/InputText.svelte",
  Message: "$lib/ui/Message.svelte",
  Password: "$lib/ui/Password.svelte",
  ProgressSpinner: "$lib/ui/ProgressSpinner.svelte",
  Select: "$lib/ui/Select.svelte",
  Skeleton: "$lib/ui/Skeleton.svelte",
  Tag: "$lib/ui/Tag.svelte",
  Textarea: "$lib/ui/Textarea.svelte",
  Toast: "$lib/ui/Toast.svelte",
  Toolbar: "$lib/ui/Toolbar.svelte",
};

const BIND_VALUE = new Set([
  "InputText",
  "Password",
  "Textarea",
  "Dropdown",
  "Select",
  "InputSwitch",
  "Checkbox",
]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (entry.name.endsWith(".vue")) out.push(path);
  }
  return out;
}

function splitSfc(source) {
  const template = source.match(/<template[^>]*>([\s\S]*)<\/template>/);
  const script = source.match(/<script([^>]*)>([\s\S]*?)<\/script>/);
  const style = source.match(/<style([^>]*)>([\s\S]*?)<\/style>/);
  return {
    template: template ? template[1] : "",
    scriptAttrs: script ? script[1] : "",
    script: script ? script[2] : "",
    styleAttrs: style ? style[1] : "",
    style: style ? style[1] && style[2] : "",
  };
}

function exprText(exp) {
  if (!exp) return "";
  return exp.content || exp.loc?.source || "";
}

function directives(node) {
  const map = {};
  for (const prop of node.props || []) {
    if (prop.type !== NodeTypes.DIRECTIVE) continue;
    const name = prop.name;
    if (!map[name]) map[name] = [];
    map[name].push(prop);
  }
  return map;
}

function dir(node, name) {
  return directives(node)[name]?.[0];
}

function isWhitespace(node) {
  return node.type === NodeTypes.TEXT && !node.content.trim();
}

function rewriteRefs(expression, refNames) {
  let text = expression
    .replaceAll("$event", "event")
    .replaceAll("$emit", "emit")
    .replaceAll("$router", "router")
    .replaceAll("$route", "route");
  const strings = [];
  const masked = text.replace(/(["'`])(?:\\.|(?!\1)[\s\S])*?\1/g, (match) => {
    strings.push(match);
    return `__STR${strings.length - 1}__`;
  });
  let next = masked;
  for (const name of [...refNames].sort((a, b) => b.length - a.length)) {
    const pattern = new RegExp(`(?<![.\\w$])${name}\\b(?!\\.value)`, "g");
    next = next.replace(pattern, `${name}.value`);
  }
  return next.replace(/__STR(\d+)__/g, (_, index) => strings[Number(index)]);
}

function collectRefNames(script) {
  const names = new Set();
  for (const match of script.matchAll(/\b(?:const|let)\s+(\w+)\s*=\s*(?:ref|computed|shallowRef|useOnline)\b/g)) {
    names.add(match[1]);
  }
  for (const match of script.matchAll(/\b(\w+)\.value\b/g)) names.add(match[1]);
  const destructure =
    /(?:const|let)\s*\{([^}]+)\}\s*=\s*(?:usePlots|usePlot|usePlotImages|useDeviceOrientation|useOnline)\s*\(/g;
  for (const match of script.matchAll(destructure)) {
    for (const part of match[1].split(",")) {
      const piece = part.trim();
      if (!piece) continue;
      const alias = piece.includes(":") ? piece.split(":").pop().trim() : piece.split(":")[0].trim();
      const original = piece.split(":")[0].trim();
      if (["refetch", "startOrientationListener", "stopOrientationListener"].includes(original)) continue;
      if (new RegExp(`\\b${alias}\\s*\\(`).test(script)) continue;
      names.add(alias);
    }
  }
  return names;
}

function eventName(raw) {
  return raw
    .split(/[:-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function renderEvent(prop, expression, refNames, tag) {
  const raw = prop.arg?.content || "click";
  const mods = new Set(
    (prop.modifiers || []).map((mod) => (typeof mod === "string" ? mod : mod.content)),
  );
  const body = expression ? rewriteRefs(expression, refNames) : "";
  const native = raw === "click" || raw === "input" || raw === "change" || raw === "submit" || raw === "keydown";
  const propName = native && tag[0] === tag[0].toLowerCase() ? `on${raw}` : raw === "click" ? "onclick" : `on${eventName(raw)}`;
  if (!body && !mods.size) return null;
  const guards = [];
  if (mods.has("enter")) guards.push('if (event.key !== "Enter") return;');
  if (mods.has("space")) guards.push('if (event.key !== " " && event.key !== "Spacebar") return;');
  if (mods.has("esc") || mods.has("escape")) guards.push('if (event.key !== "Escape") return;');
  if (mods.has("self")) guards.push("if (event.target !== event.currentTarget) return;");
  if (mods.has("prevent")) guards.push("event.preventDefault();");
  if (mods.has("stop")) guards.push("event.stopPropagation();");
  const call = body ? (/^[\w.]+$/.test(body) ? `${body}(event)` : body) : "";
  const needsWrap = mods.size > 0 || body.includes("event") || /[=;]/.test(body);
  const handler =
    !needsWrap && body && /^[\w.]+$/.test(body)
      ? body
      : `(event) => { ${guards.join(" ")} ${call} }`;
  return { name: propName, handler };
}

function renderAttrs(node, refNames, skipControl) {
  const attrs = [];
  const events = [];
  let staticClass = "";
  let dynamicClass = "";
  for (const prop of node.props || []) {
    if (prop.type === NodeTypes.ATTRIBUTE) {
      if (prop.name === "class") staticClass = prop.value?.content || "";
      else if (prop.name === "to") continue;
      else if (prop.value == null) attrs.push(prop.name);
      else attrs.push(`${prop.name}="${prop.value.content.replaceAll('"', "&quot;")}"`);
      continue;
    }
    if (prop.type !== NodeTypes.DIRECTIVE) continue;
    if (skipControl && ["if", "else-if", "else", "for"].includes(prop.name)) continue;
    if (prop.name === "bind" && prop.arg?.content === "class") {
      dynamicClass = rewriteRefs(exprText(prop.exp), refNames);
      continue;
    }
    if (prop.name === "bind" && (prop.arg?.content === "key" || prop.arg?.content === "to")) continue;
    if (prop.type === NodeTypes.ATTRIBUTE && prop.name === "to") continue;
    if (prop.name === "bind" && !prop.arg) {
      attrs.push(`{...${rewriteRefs(exprText(prop.exp), refNames)}}`);
      continue;
    }
    if (prop.name === "bind") {
      const arg = prop.arg.content;
      attrs.push(`${arg}={${rewriteRefs(exprText(prop.exp), refNames)}}`);
      continue;
    }
    if (prop.name === "on") {
      const rendered = renderEvent(prop, exprText(prop.exp), refNames, node.tag);
      if (rendered) events.push(rendered);
      continue;
    }
    if (prop.name === "model") {
      const arg = prop.arg?.content;
      const expression = rewriteRefs(exprText(prop.exp), refNames);
      const native = node.tag === node.tag.toLowerCase();
      const checkbox = native && (node.props || []).some((item) => item.name === "type" && item.value?.content === "checkbox");
      if (arg) attrs.push(`bind:${arg}={${expression}}`);
      else if (checkbox || node.tag === "Checkbox" || node.tag === "InputSwitch") attrs.push(`bind:value={${expression}}`);
      else if (!native || BIND_VALUE.has(node.tag) || node.tag === "input" || node.tag === "textarea" || node.tag === "select") {
        attrs.push(checkbox ? `bind:checked={${expression}}` : `bind:value={${expression}}`);
      } else attrs.push(`bind:value={${expression}}`);
      continue;
    }
    if (prop.name === "show") {
      attrs.push(`style:display={${rewriteRefs(exprText(prop.exp), refNames)} ? undefined : "none"}`);
      continue;
    }
    if (prop.name === "html") continue;
  }
  const grouped = new Map();
  for (const event of events) {
    const list = grouped.get(event.name) || [];
    list.push(event.handler);
    grouped.set(event.name, list);
  }
  for (const [name, handlers] of grouped) {
    if (handlers.length === 1) attrs.push(`${name}={${handlers[0]}}`);
    else attrs.push(`${name}={(event) => { ${handlers.map((handler) => `(${handler})(event);`).join(" ")} }}`);
  }
  if (staticClass || dynamicClass) {
    if (dynamicClass && staticClass) attrs.unshift(`class="${staticClass} {cls(${dynamicClass})}"`);
    else if (dynamicClass) attrs.unshift(`class={cls(${dynamicClass})}`);
    else attrs.unshift(`class="${staticClass}"`);
  }
  return attrs.length ? " " + attrs.join(" ") : "";
}

function renderChildren(nodes, refNames) {
  let html = "";
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (isWhitespace(node)) {
      html += node.content;
      continue;
    }
    if (node.type === NodeTypes.ELEMENT && dir(node, "if")) {
      const chain = [node];
      let cursor = index + 1;
      while (cursor < nodes.length) {
        if (isWhitespace(nodes[cursor])) {
          cursor += 1;
          continue;
        }
        if (nodes[cursor].type === NodeTypes.ELEMENT && (dir(nodes[cursor], "else-if") || dir(nodes[cursor], "else"))) {
          chain.push(nodes[cursor]);
          cursor += 1;
          continue;
        }
        break;
      }
      html += renderIf(chain, refNames);
      index = cursor - 1;
      continue;
    }
    html += renderNode(node, refNames);
  }
  return html;
}

function renderIf(chain, refNames) {
  return chain
    .map((node, index) => {
      const each = dir(node, "for");
      const inner = renderElement(node, refNames, true);
      const wrapped = each ? renderEach(node, inner, refNames) : inner;
      if (index === 0) return `{#if ${rewriteRefs(exprText(dir(node, "if").exp), refNames)}}${wrapped}`;
      if (dir(node, "else-if")) return `{:else if ${rewriteRefs(exprText(dir(node, "else-if").exp), refNames)}}${wrapped}`;
      return `{:else}${wrapped}`;
    })
    .join("") + "{/if}";
}

function bindExpression(node, arg) {
  const prop = (node.props || []).find(
    (item) => item.type === NodeTypes.DIRECTIVE && item.name === "bind" && item.arg?.content === arg,
  );
  return prop ? exprText(prop.exp) : "";
}

function renderEach(node, inner, refNames) {
  const directive = dir(node, "for");
  const source = exprText(directive.exp);
  const match = source.match(/^(?:\(([^)]+)\)|([^)\s]+))\s+(?:in|of)\s+([\s\S]+)$/);
  if (!match) return inner;
  const binding = (match[1] || match[2]).trim();
  const list = rewriteRefs(match[3].trim(), refNames);
  const key = bindExpression(node, "key");
  const keyText = key ? ` (${rewriteRefs(key, refNames)})` : "";
  return `{#each ${list} as ${binding}${keyText}}${inner}{/each}`;
}

function renderNode(node, refNames) {
  if (node.type === NodeTypes.TEXT) return node.content.replaceAll("{", "{'{'}");
  if (node.type === NodeTypes.COMMENT) return "";
  if (node.type === NodeTypes.INTERPOLATION) {
    const expression = rewriteRefs(exprText(node.content), refNames);
    return `{${expression}}`;
  }
  if (node.type !== NodeTypes.ELEMENT) return "";
  const each = dir(node, "for");
  const inner = renderElement(node, refNames, false);
  return each ? renderEach(node, inner, refNames) : inner;
}

function renderElement(node, refNames, skipIf) {
  const htmlDir = dir(node, "html");
  if (htmlDir) return `{@html ${rewriteRefs(exprText(htmlDir.exp), refNames)}}`;
  const slot = dir(node, "slot");
  if (node.tag === "template" && slot) {
    const name = slot.arg?.content || "children";
    return `{#snippet ${name}()}${renderChildren(node.children || [], refNames)}{/snippet}`;
  }
  if (node.tag === "template") return renderChildren(node.children || [], refNames);
  if (node.tag === "router-view") return "{@render children?.()}";
  if (node.tag === "router-link") {
    const bound = bindExpression(node, "to");
    const literal = (node.props || []).find((prop) => prop.type === NodeTypes.ATTRIBUTE && prop.name === "to")?.value?.content;
    const href = bound ? `{${rewriteRefs(bound, refNames)}}` : `"${literal || "/"}"`;
    const attrs = renderAttrs(node, refNames, skipIf);
    return `<a href=${href}${attrs}>${renderChildren(node.children || [], refNames)}</a>`;
  }
  const attrs = renderAttrs(node, refNames, skipIf);
  const children = renderChildren(node.children || [], refNames);
  const voids = new Set(["img", "input", "br", "hr", "meta", "link"]);
  if (voids.has(node.tag)) return `<${node.tag}${attrs} />`;
  return `<${node.tag}${attrs}>${children}</${node.tag}>`;
}

function endOfParens(source, openParen) {
  let depth = 0;
  for (let index = openParen; index < source.length; index += 1) {
    if (source[index] === "(") depth += 1;
    else if (source[index] === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error("Unbalanced parentheses");
}

function replaceBalanced(source, pattern, replacer) {
  let result = "";
  let cursor = 0;
  for (const match of source.matchAll(pattern)) {
    if (match.index < cursor) continue;
    const replacement = replacer(source, match, match.index);
    result += source.slice(cursor, match.index) + replacement.text;
    cursor = replacement.end;
  }
  return result + source.slice(cursor);
}

function transformScript(script, template, needsChildren) {
  let next = script.replaceAll(".vue", ".svelte");
  const modelNames = [];
  next = next.replace(
    /const\s+(\w+)\s*=\s*defineModel<[^>]+>\(\s*["'](\w+)["']\s*,\s*\{\s*default:\s*([^}]+)\}\s*\)\s*;?/g,
    (_, local, prop, fallback) => {
      modelNames.push(local);
      return `let { ${prop}: ${local} = $bindable(${fallback.trim()}) } = $props();`;
    },
  );
  for (const name of modelNames) {
    next = next.replace(new RegExp(`\\b${name}\\.value\\b`, "g"), name);
  }
  next = replaceBalanced(next, /const\s+(\w+)\s*=\s*withDefaults\(/g, (source, match, at) => {
    const paren = source.indexOf("(", at);
    const end = endOfParens(source, paren);
    const inside = source.slice(paren + 1, end).replace("defineProps", "$props");
    return {
      end: source.indexOf(";", end) + 1,
      text: `const ${match[1]} = withDefaults(${inside});`,
    };
  });
  next = next.replace(/const\s+(\w+)\s*=\s*defineProps<([\s\S]*?)>\(\)\s*;/g, (_, name, type) => `const ${name} = $props<${type.trim()}>();`);
  next = replaceBalanced(next, /const\s+(\w+)\s*=\s*defineProps\(/g, (source, match, at) => {
    const paren = source.indexOf("(", at);
    const end = endOfParens(source, paren);
    return {
      end: source.indexOf(";", end) + 1,
      text: `const ${match[1]} = $props<Record<string, any>>();`,
    };
  });
  next = next.replace(/const\s+(\w+)\s*=\s*defineEmits(?:<[\s\S]*?>)?\((?:[^)(]|\([^)]*\))*\)\s*;?/g, `function emit(event: string, ...args: any[]) {
  const name = "on" + String(event).split(/[:-]/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
  const handler = typeof props === "undefined" ? undefined : (props as any)[name];
  if (typeof handler === "function") handler(...args);
}`);
  if (next.includes("function emit(") && !next.includes("$props")) {
    next = `let props = $props<Record<string, any>>();\n${next}`;
  }
  if (!next.includes("function emit(") && template.includes("emit(")) {
    next += `\nfunction emit(event: string, ...args: any[]) {\n  const name = "on" + event.split(/[:-]/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");\n  const handler = (props as any)?.[name];\n  if (typeof handler === "function") handler(...args);\n}\n`;
  }
  next = next.replace(/^[ \t]*import\s+[^\r\n]*from\s+["']primevue\/(?!usetoast)[^"']+["'];?\r?\n/gm, "");
  const used = new Set();
  for (const tag of Object.keys(UI)) {
    if (new RegExp(`<${tag}(\\s|>)`).test(template)) used.add(tag);
  }
  const imports = [...used]
    .map((tag) => `import ${tag} from "${UI[tag]}";`)
    .join("\n");
  if (imports) next = `${imports}\n${next}`;
  if (template.includes("cls(") && !next.includes("$lib/ui/cls")) {
    next = `import { cls } from "$lib/ui/cls";\n${next}`;
  }
  if (needsChildren && !next.includes("children")) {
    next = `let { children } = $props();\n${next}`;
  }
  if (next.includes("withDefaults(") && !next.includes("withDefaults")) {
    next = `import { withDefaults } from "@/compat/vue.svelte";\n${next}`;
  }
  if (next.includes("withDefaults(") && !/import\s*\{[^}]*withDefaults/.test(next)) {
    next = next.replace(/import\s*\{([^}]+)\}\s*from\s*["']vue["'];/, (all, names) => {
      if (names.includes("withDefaults")) return all;
      return `import {${names}, withDefaults } from "vue";`;
    });
    if (!/withDefaults/.test(next.split("function emit")[0])) {
      next = `import { withDefaults } from "@/compat/vue.svelte";\n${next}`;
    }
  }
  const refNames = collectRefNames(next);
  for (const name of modelNames) refNames.delete(name);
  return { script: next.trim() + "\n", refNames };
}

function convert(source) {
  const sfc = splitSfc(source);
  const ast = parse(sfc.template || "<div></div>");
  const needsChildren = sfc.template.includes("<router-view");
  const transformed = transformScript(sfc.script, sfc.template, needsChildren);
  const template = renderChildren(ast.children, transformed.refNames).trim();
  let script = transformed.script;
  if (template.includes("cls(") && !script.includes("$lib/ui/cls")) {
    script = `import { cls } from "$lib/ui/cls";\n${script}`;
  }
  let style = "";
  if (sfc.style) {
    const css = sfc.style.replaceAll(":deep(", ":global(").replaceAll(">>>", ":global(");
    style = `\n<style>\n${css.trim()}\n</style>\n`;
  }
  return `<script lang="ts">\n${script}</script>\n\n${template}\n${style}`;
}

const root = join(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const files = walk(join(root, "src"));
let failed = 0;
for (const file of files) {
  try {
    const source = readFileSync(file, "utf8");
    const svelte = convert(source);
    const target = file.replace(/\.vue$/, ".svelte");
    writeFileSync(target, svelte);
    unlinkSync(file);
    console.log("converted", relative(root, target));
  } catch (error) {
    failed += 1;
    console.error("FAILED", file, error);
  }
}
if (failed) process.exitCode = 1;
