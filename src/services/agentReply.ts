export interface ParsedToolCall {
  callID: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ParsedPrompt {
  text: string;
  toolCalls: ParsedToolCall[];
}

export interface ToolTrace {
  name: string;
  json: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function argumentsOf(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      return asRecord(JSON.parse(value)) ?? {};
    } catch {
      return {};
    }
  }
  return asRecord(value) ?? {};
}

function toolCallFrom(value: unknown): ParsedToolCall | null {
  const record = asRecord(value);
  if (!record) return null;
  const nested = asRecord(record.function);
  const source = nested ?? record;
  const name = textValue(source.name) || textValue(source.toolName);
  if (!name) return null;
  const callID =
    textValue(record.callID) ||
    textValue(record.callId) ||
    textValue(source.callID) ||
    textValue(source.id);
  const args = source.arguments ?? source.args ?? source.input ?? record.arguments;
  return { callID, name, arguments: argumentsOf(args) };
}

function isToolPayload(value: unknown): boolean {
  const record = asRecord(value);
  return Boolean(record && typeof record.ok === "boolean");
}

function isToolCall(record: Record<string, unknown>): boolean {
  const type = textValue(record.type);
  if (type === "tool-call" || type === "function-call" || type === "function") {
    return true;
  }
  return (
    !type &&
    Boolean(textValue(record.name)) &&
    ("arguments" in record || "args" in record)
  );
}

export function parsePromptResult(result: unknown): ParsedPrompt {
  const texts: string[] = [];
  const toolCalls: ParsedToolCall[] = [];
  const seen = new Set<string>();

  const addCall = (call: ParsedToolCall | null) => {
    if (!call) return;
    const key = `${call.callID}:${call.name}:${JSON.stringify(call.arguments)}`;
    if (seen.has(key)) return;
    seen.add(key);
    toolCalls.push(call);
  };

  const visit = (value: unknown, depth: number) => {
    if (depth > 6 || value == null) return;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return;
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (isToolPayload(parsed)) return;
          const callsBefore = toolCalls.length;
          visit(parsed, depth + 1);
          if (toolCalls.length > callsBefore) return;
        } catch {
          texts.push(trimmed);
          return;
        }
      }
      texts.push(trimmed);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    const record = asRecord(value);
    if (!record) return;
    if (isToolCall(record)) {
      addCall(toolCallFrom(record.value) ?? toolCallFrom(record));
      return;
    }
    const type = textValue(record.type);
    if (type === "text") {
      const text =
        textValue(record.value) || textValue(record.text) || textValue(record.content);
      if (text) texts.push(text);
      return;
    }
    if ("content" in record) visit(record.content, depth + 1);
    if ("output" in record) visit(record.output, depth + 1);
    if ("message" in record) visit(record.message, depth + 1);
    const text = textValue(record.text);
    if (text) texts.push(text);
  };

  visit(result, 0);
  return { text: [...new Set(texts)].join("\n").trim(), toolCalls };
}

function stringField(record: Record<string, unknown>, key: string): string {
  return textValue(record[key]);
}

function scalarField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return textValue(value);
}

function agePhrase(op: string, years: string): string {
  if (op === "gt") return `over ${years}`;
  if (op === "gte") return `${years} or over`;
  if (op === "lt") return `under ${years}`;
  if (op === "lte") return `${years} or under`;
  return years;
}

function personLine(value: unknown): string {
  const person = asRecord(value) ?? {};
  const name =
    stringField(person, "full_name") ||
    [stringField(person, "forename"), stringField(person, "surname")]
      .filter(Boolean)
      .join(" ") ||
    "Unnamed";
  const dates = [
    stringField(person, "date_of_birth"),
    stringField(person, "date_of_death"),
  ].filter(Boolean);
  return dates.length ? `${name} (${dates.join(" – ")})` : name;
}

function plotLine(value: unknown): string {
  const plot = asRecord(value) ?? {};
  const place = [
    stringField(plot, "section"),
    stringField(plot, "row"),
    stringField(plot, "number"),
  ].filter(Boolean);
  return place.length ? place.join(" / ") : stringField(plot, "id") || "plot";
}

function personKey(value: unknown): string {
  const person = asRecord(value) ?? {};
  return [
    stringField(person, "full_name"),
    stringField(person, "forename"),
    stringField(person, "surname"),
    stringField(person, "date_of_birth"),
    stringField(person, "date_of_death"),
  ]
    .join("|")
    .toLowerCase();
}

function peopleBlock(record: Record<string, unknown>, empty: string): string {
  const people = Array.isArray(record.people) ? record.people : [];
  if (people.length === 0) return empty;
  const counts = new Map<string, number>();
  const unique: unknown[] = [];
  for (const person of people) {
    const key = personKey(person);
    const seen = counts.get(key) ?? 0;
    counts.set(key, seen + 1);
    if (seen === 0) unique.push(person);
  }
  const heading = unique.length === 1 ? "Found 1 person:" : `Found ${unique.length} people:`;
  const lines = unique.map((person) => {
    const copies = counts.get(personKey(person)) ?? 1;
    const extra = copies > 1 ? ` — ${copies} records` : "";
    return `- ${personLine(person)}${extra}`;
  });
  const more = record.truncated ? "\nMore people match than are listed here." : "";
  return `${heading}\n${lines.join("\n")}${more}`;
}

export function formatToolResult(name: string, json: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return json;
  }
  const record = asRecord(parsed);
  if (!record) return json;
  if (record.ok === false) {
    return stringField(record, "error") || `${name} failed.`;
  }

  if (name === "search_people") {
    const died = stringField(record, "died_year");
    const born = stringField(record, "born_year");
    const age = scalarField(record, "died_age");
    const dated = typeof record.dated === "number" ? record.dated : 0;
    const undated = typeof record.undated === "number" ? record.undated : 0;
    const empty = age
      ? dated === 0 && undated > 0
        ? "Birth and death dates are missing, so age at death cannot be worked out."
        : `No one is recorded as dying aged ${agePhrase(stringField(record, "died_age_op"), age)}.`
      : died
        ? `No one is recorded as dying in ${died}.`
        : born
          ? `No one is recorded as born in ${born}.`
          : "No people matched that name.";
    const body = peopleBlock(record, empty);
    if (undated > 0 && Array.isArray(record.people) && record.people.length > 0) {
      const records = undated === 1 ? "record has" : "records have";
      return `${body}\n${undated} ${records} no birth and death dates, so age is unknown.`;
    }
    return body;
  }
  if (name === "get_selected_cemetery") {
    const cemetery = asRecord(record.cemetery);
    const cemeteryName = cemetery ? stringField(cemetery, "name") : "";
    return cemeteryName ? `Open cemetery: ${cemeteryName}` : "A cemetery is open.";
  }
  if (name === "list_plots") {
    const plots = Array.isArray(record.plots) ? record.plots : [];
    if (plots.length === 0) return "No plots matched.";
    const total = typeof record.total === "number" ? record.total : plots.length;
    const more = record.truncated ? "\nMore plots match than are listed here." : "";
    return `${total === 1 ? "1 plot" : `${total} plots`}:\n${plots
      .map((plot) => `- ${plotLine(plot)}`)
      .join("\n")}${more}`;
  }
  if (name === "get_plot") {
    const plot = plotLine(record.plot);
    const people = Array.isArray(record.people) ? record.people : [];
    if (people.length === 0) return `Plot ${plot} has no people recorded.`;
    return `Plot ${plot}:\n${people.map((person) => `- ${personLine(person)}`).join("\n")}`;
  }
  if (name === "focus_plot") return "Showing that plot on the map.";
  if (name === "focus_cemetery") return "Centered the map on your position.";
  if (name === "begin_plot_drawing") {
    return "Drawing is on. Outline the plot on the map.";
  }
  if (name === "create_plot_at_gps") {
    const plot = asRecord(record.plot);
    const number = plot ? stringField(plot, "number") : "";
    const size = plot ? stringField(plot, "size") : "";
    return `Created ${size || "a"} plot${number ? ` ${number}` : ""}.`;
  }
  if (name === "add_person") {
    const person = asRecord(record.person);
    return person ? `Added ${personLine(person)}.` : "Added the person.";
  }
  if (name === "update_plot") return "Updated the plot.";
  if (name === "read_headstone") {
    const transcription = stringField(record, "transcription");
    const people = peopleBlock(record, "");
    return [transcription, people].filter(Boolean).join("\n\n") || "Read the headstone.";
  }
  return `${name} finished.`;
}

export interface AssistantField {
  label: string;
  value: string;
}

export interface AssistantCard {
  title: string;
  note?: string;
  fields: AssistantField[];
  plotId?: string;
}

export interface AssistantTableRow {
  cells: string[];
  plotId?: string;
}

export interface AssistantView {
  title: string;
  note?: string;
  columns?: string[];
  rows?: AssistantTableRow[];
  cards?: AssistantCard[];
}

export interface AssistantMessage {
  text: string;
  view?: AssistantView;
}

function displayDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function plotCells(value: unknown): string[] {
  const plot = asRecord(value) ?? {};
  return [
    stringField(plot, "section") || "—",
    stringField(plot, "row") || "—",
    stringField(plot, "number") || "—",
  ];
}

function plotRow(value: unknown): AssistantTableRow {
  const plot = asRecord(value) ?? {};
  const plotId = stringField(plot, "id");
  return {
    cells: plotCells(value),
    ...(plotId ? { plotId } : {}),
  };
}

function personCard(value: unknown, copies: number): AssistantCard {
  const person = asRecord(value) ?? {};
  const fields: AssistantField[] = [];
  const born = stringField(person, "date_of_birth");
  const died = stringField(person, "date_of_death");
  if (born) fields.push({ label: "Born", value: displayDate(born) });
  if (died) fields.push({ label: "Died", value: displayDate(died) });
  const age = scalarField(person, "age");
  if (age) fields.push({ label: "Age", value: age });
  const plotId = stringField(person, "plot_id");
  return {
    title: personLine(person).replace(/\s+\(.*\)$/, ""),
    note: copies > 1 ? `${copies} records` : undefined,
    fields,
    ...(plotId ? { plotId } : {}),
  };
}

function uniquePeople(people: unknown[]): Array<{ person: unknown; copies: number }> {
  const counts = new Map<string, number>();
  const unique: unknown[] = [];
  for (const person of people) {
    const key = personKey(person);
    const seen = counts.get(key) ?? 0;
    counts.set(key, seen + 1);
    if (seen === 0) unique.push(person);
  }
  return unique.map((person) => ({
    person,
    copies: counts.get(personKey(person)) ?? 1,
  }));
}

export function presentToolResult(name: string, json: string): AssistantMessage {
  const text = formatToolResult(name, json);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { text };
  }
  const record = asRecord(parsed);
  if (!record || record.ok === false) return { text };

  if (name === "list_plots") {
    const plots = Array.isArray(record.plots) ? record.plots : [];
    if (plots.length === 0) return { text };
    return {
      text,
      view: {
        title: plots.length === 1 ? "1 plot" : `${record.total ?? plots.length} plots`,
        note: record.truncated ? "More plots match than are listed here." : undefined,
        columns: ["Section", "Row", "No."],
        rows: [...plots]
          .sort((a, b) =>
            plotCells(a)
              .join("\u0000")
              .localeCompare(plotCells(b).join("\u0000"), undefined, {
                numeric: true,
              }),
          )
          .map(plotRow),
      },
    };
  }

  if (name === "search_people" || name === "read_headstone" || name === "get_plot") {
    const people = Array.isArray(record.people) ? record.people : [];
    const grouped = uniquePeople(people);
    const cards = grouped.map(({ person, copies }) => personCard(person, copies));
    if (name === "search_people") {
      if (cards.length === 0) return { text };
      const died = stringField(record, "died_year");
      const born = stringField(record, "born_year");
      const age = scalarField(record, "died_age");
      const undated = typeof record.undated === "number" ? record.undated : 0;
      const when = [
        born ? `Born in ${born}` : "",
        died ? `Died in ${died}` : "",
        age ? `Died aged ${agePhrase(stringField(record, "died_age_op"), age)}` : "",
      ].filter(Boolean);
      const count = cards.length === 1 ? "1 person" : `${cards.length} people`;
      const notes = [
        record.truncated ? "More people match than are listed here." : "",
        undated > 0
          ? `${undated} ${undated === 1 ? "record has" : "records have"} no birth and death dates, so age is unknown.`
          : "",
      ].filter(Boolean);
      return {
        text,
        view: {
          title: when.length ? `${when.join(", ")} · ${count}` : count,
          note: notes.join(" ") || undefined,
          cards,
        },
      };
    }
    if (name === "get_plot") {
      const plot = asRecord(record.plot) ?? {};
      return {
        text,
        view: {
          title: `Plot ${stringField(plot, "number") || plotLine(plot)}`,
          columns: ["Section", "Row", "No."],
          rows: [plotRow(plot)],
          cards,
          note: cards.length === 0 ? "No people recorded." : undefined,
        },
      };
    }
    const transcription = stringField(record, "transcription");
    return {
      text,
      view: {
        title: "Headstone",
        note: transcription || undefined,
        cards,
      },
    };
  }

  if (name === "create_plot_at_gps") {
    const plot = asRecord(record.plot) ?? {};
    return {
      text,
      view: {
        title: "Plot created",
        columns: ["Section", "Row", "No."],
        rows: [plotRow(plot)],
        note: stringField(plot, "size") ? `${stringField(plot, "size")} grave` : undefined,
      },
    };
  }

  return { text };
}

export function formatToolTrace(trace: ToolTrace[]): string {
  return trace
    .map((entry) => formatToolResult(entry.name, entry.json))
    .filter(Boolean)
    .join("\n\n");
}

export interface AssistantRoute {
  name: string;
  input: Record<string, unknown>;
}

function plotIdIn(text: string): string {
  return text.match(/\(id\s+([^)]+)\)/i)?.[1]?.trim() ?? "";
}

function personName(text: string): string {
  const named = text.match(
    /\b(?:named|called|surname)\s+([A-Za-z][\w'’-]*(?:\s+[A-Za-z][\w'’-]*)*)/i,
  );
  return named?.[1]?.trim() ?? "";
}

function isAddPerson(text: string): boolean {
  return /\badd\b/i.test(text) && /\bperson\b/i.test(text);
}

function lifeYears(text: string): { died_year?: string; born_year?: string } {
  const year = "(1[5-9]\\d{2}|20\\d{2})";
  const died = text.match(
    new RegExp(`\\b(?:died|dying|death|deaths)\\b[\\s\\S]{0,40}?\\b(?:in\\s+)?(${year})\\b`, "i"),
  );
  const born = text.match(
    new RegExp(`\\b(?:born|birth)\\b[\\s\\S]{0,40}?\\b(?:in\\s+)?(${year})\\b`, "i"),
  );
  return {
    ...(died ? { died_year: died[1] } : {}),
    ...(born ? { born_year: born[1] } : {}),
  };
}

export function lifeAge(text: string): { died_age?: number; died_age_op?: string } {
  if (!/\b(?:died|dying|death|deaths|aged|age|years?\s+old|older|younger)\b/i.test(text)) {
    return {};
  }
  const compared = text.match(
    /\b(over|above|older than|more than|under|below|younger than|less than|at least|at most)\s+(\d{1,3})\s+years?\s+of\s+age\b/i,
  );
  if (compared) {
    const years = Number(compared[2]);
    const word = compared[1].toLowerCase();
    const op = /under|below|younger|less/.test(word)
      ? "lt"
      : /at least/.test(word)
        ? "gte"
        : /at most/.test(word)
          ? "lte"
          : "gt";
    if (Number.isInteger(years) && years <= 130) return { died_age: years, died_age_op: op };
  }
  const exactAge = text.match(/\b(\d{1,3})\s+years?\s+of\s+age\b/i);
  if (exactAge) {
    const years = Number(exactAge[1]);
    if (Number.isInteger(years) && years <= 130) return { died_age: years, died_age_op: "eq" };
  }
  const patterns: Array<{ re: RegExp; op: string }> = [
    {
      re: /\b(?:aged|age)\s+(?:of\s+)?(?:over|above|older than|more than)\s+(\d{1,3})\b/i,
      op: "gt",
    },
    { re: /\b(?:over|above|older than|more than)\s+(\d{1,3})(?:\s+years?\b)?/i, op: "gt" },
    {
      re: /\b(?:aged|age)\s+(?:of\s+)?(?:under|below|younger than|less than)\s+(\d{1,3})\b/i,
      op: "lt",
    },
    { re: /\b(?:under|below|younger than|less than)\s+(\d{1,3})(?:\s+years?\b)?/i, op: "lt" },
    { re: /\b(?:at least)\s+(\d{1,3})\b/i, op: "gte" },
    { re: /\b(\d{1,3})\s*(?:or older|or over|\+)\b/i, op: "gte" },
    { re: /\b(?:at most)\s+(\d{1,3})\b/i, op: "lte" },
    { re: /\b(\d{1,3})\s*(?:or younger|or under)\b/i, op: "lte" },
    { re: /\b(?:aged|age)\s+(?:of\s+|exactly\s+)?(\d{1,3})\b/i, op: "eq" },
    { re: /\b(\d{1,3})\s+years?\s+old\b/i, op: "eq" },
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern.re);
    if (!match) continue;
    const years = Number(match[1]);
    if (!Number.isInteger(years) || years > 130) continue;
    return { died_age: years, died_age_op: pattern.op };
  }
  return {};
}

/** Map a chip or typed request onto one app action, skipping the on-device model. */
export function routeAssistantMessage(text: string): AssistantRoute | null {
  const raw = text.trim();
  if (/^which cemetery is open\??$/i.test(raw)) {
    return { name: "get_selected_cemetery", input: {} };
  }
  if (/^list the plots\b/i.test(raw)) {
    return { name: "list_plots", input: {} };
  }
  if (/^center the map on my gps\b/i.test(raw)) {
    return { name: "focus_cemetery", input: {} };
  }
  if (/^turn on drawing\b/i.test(raw)) {
    return { name: "begin_plot_drawing", input: {} };
  }
  const grave = raw.match(/^create a (single|double) grave at my gps\b/i);
  if (grave) {
    return {
      name: "create_plot_at_gps",
      input: { size: grave[1].toLowerCase() },
    };
  }

  const years = lifeYears(raw);
  const age = lifeAge(raw);
  if (
    !isAddPerson(raw) &&
    (years.died_year || years.born_year || age.died_age != null)
  ) {
    return { name: "search_people", input: { ...years, ...age } };
  }
  const named = personName(raw);
  if (!isAddPerson(raw) && named && /\b(?:people|person|someone|surname|named|called|details)\b/i.test(raw)) {
    return { name: "search_people", input: { query: named } };
  }
  if (isAddPerson(raw)) {
    const plotId = plotIdIn(raw);
    if (!named || !plotId) return null;
    const parts = named.split(/\s+/).filter(Boolean);
    const input: Record<string, unknown> = { plot_id: plotId };
    if (parts.length === 1) input.surname = parts[0];
    else {
      input.forename = parts[0];
      input.surname = parts.slice(1).join(" ");
    }
    return { name: "add_person", input };
  }

  const plotId = plotIdIn(raw);
  if (!plotId) return null;
  if (/^show the details of plot\b/i.test(raw)) {
    return { name: "get_plot", input: { plot_id: plotId } };
  }
  if (/^zoom the map to plot\b/i.test(raw)) {
    return { name: "focus_plot", input: { plot_id: plotId } };
  }
  if (/^read the headstone on plot\b/i.test(raw)) {
    return { name: "read_headstone", input: { plot_id: plotId } };
  }
  const notes = raw.match(/\bto say\s+(.+?)[.?!]?$/i)?.[1]?.trim() ?? "";
  if (/^update the notes on plot\b/i.test(raw) && notes) {
    return { name: "update_plot", input: { plot_id: plotId, notes } };
  }
  return null;
}

export function incompleteAssistantMessage(text: string): string | null {
  if (routeAssistantMessage(text)) return null;
  const raw = text.trim();
  if (
    !isAddPerson(raw) &&
    /\b(?:aged|age|years?\s+old|older than|younger than)\b/i.test(raw) &&
    lifeAge(raw).died_age == null &&
    !lifeYears(raw).died_year &&
    !lifeYears(raw).born_year
  ) {
    return "Say the age, for example “people who died aged over 80”.";
  }
  if (
    !isAddPerson(raw) &&
    /\b(?:people|person|someone|surname)\b/i.test(raw) &&
    /\b(?:named|called|surname)\b/i.test(raw)
  ) {
    return "Type the name to search for.";
  }
  if (isAddPerson(raw)) {
    return "Choose a plot on the map, then send “Add a person named …” with their name.";
  }
  if (/^update the notes on plot\b/i.test(raw)) {
    return "Choose a plot and type the note to save.";
  }
  if (
    /^(show the details of plot|zoom the map to plot|read the headstone on plot)\b/i.test(
      raw,
    )
  ) {
    return "Choose a plot on the map first.";
  }
  return null;
}

export function toolResponsePrompt(trace: Array<ParsedToolCall & { json: string }>) {
  return [
    {
      role: "tool-response",
      content: trace.map((call, index) => ({
        type: "tool-response",
        value: {
          callID: call.callID || `call_${index + 1}`,
          name: call.name,
          result: [{ type: "text", value: call.json }],
        },
      })),
    },
  ];
}
