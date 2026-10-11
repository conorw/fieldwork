import { describe, expect, it } from "vitest";
import {
  formatToolResult,
  incompleteAssistantMessage,
  parsePromptResult,
  presentToolResult,
  routeAssistantMessage,
} from "../src/services/agentReply";

const smith = {
  ok: true,
  total: 1,
  people: [
    {
      id: "person_1",
      plot_id: "plot_1",
      full_name: "Ada Smith",
      forename: "Ada",
      surname: "Smith",
      date_of_birth: "1840-01-02",
      date_of_death: "1901-03-04",
    },
  ],
  truncated: false,
};

describe("parsePromptResult", () => {
  it("keeps a written answer", () => {
    expect(parsePromptResult("Ada Smith is in the cemetery.").text).toBe(
      "Ada Smith is in the cemetery.",
    );
  });

  it("reads text parts from a content list", () => {
    expect(
      parsePromptResult([
        { type: "text", value: "Found Ada Smith." },
      ]).text,
    ).toBe("Found Ada Smith.");
  });

  it("reads a tool call without treating its arguments as the answer", () => {
    const parsed = parsePromptResult([
      {
        type: "tool-call",
        value: {
          callID: "call_1",
          name: "search_people",
          arguments: { query: "smith" },
        },
      },
    ]);

    expect(parsed.text).toBe("");
    expect(parsed.toolCalls).toEqual([
      {
        callID: "call_1",
        name: "search_people",
        arguments: { query: "smith" },
      },
    ]);
  });

  it("ignores a tool payload string so it can be formatted separately", () => {
    expect(parsePromptResult(JSON.stringify(smith)).text).toBe("");
  });
});

describe("formatToolResult", () => {
  it("lays out a plot list as labeled columns", () => {
    const view = presentToolResult(
      "list_plots",
      JSON.stringify({
        ok: true,
        total: 2,
        plots: [
          { id: "plot_7", section: "A", row: "1", number: "7" },
          { id: "plot_1", section: "A", row: "1", number: "1" },
        ],
        truncated: false,
      }),
    ).view;

    expect(view?.columns).toEqual(["Section", "Row", "No."]);
    expect(view?.rows).toEqual([
      { cells: ["A", "1", "1"], plotId: "plot_1" },
      { cells: ["A", "1", "7"], plotId: "plot_7" },
    ]);
  });

  it("lays out a person with a readable date", () => {
    const view = presentToolResult(
      "search_people",
      JSON.stringify(smith),
    ).view;
    expect(view?.cards?.[0]).toMatchObject({
      title: "Ada Smith",
      fields: [
        { label: "Born", value: "2 Jan 1840" },
        { label: "Died", value: "4 Mar 1901" },
      ],
    });
  });

  it("lists people found by name", () => {
    expect(formatToolResult("search_people", JSON.stringify(smith))).toBe(
      "Found 1 person:\n- Ada Smith (1840-01-02 – 1901-03-04)",
    );
  });

  it("says when nobody matched", () => {
    expect(
      formatToolResult(
        "search_people",
        JSON.stringify({ ok: true, total: 0, people: [], truncated: false }),
      ),
    ).toBe("No people matched that name.");
  });

  it("routes the plot list chip without the on-device model", () => {
    expect(routeAssistantMessage("List the plots in this cemetery.")).toEqual({
      name: "list_plots",
      input: {},
    });
  });

  it("routes a name search and a plot read from the chip text", () => {
    expect(routeAssistantMessage("Search for people named smith")).toEqual({
      name: "search_people",
      input: { query: "smith" },
    });
    expect(routeAssistantMessage("search for people called fone")).toEqual({
      name: "search_people",
      input: { query: "fone" },
    });
    expect(routeAssistantMessage("search for all people called smith")).toEqual({
      name: "search_people",
      input: { query: "smith" },
    });
    expect(routeAssistantMessage("show me details for surname fone")).toEqual({
      name: "search_people",
      input: { query: "fone" },
    });
    expect(routeAssistantMessage("people who died in 1948")).toEqual({
      name: "search_people",
      input: { died_year: "1948" },
    });
    expect(routeAssistantMessage("people who died aged over 80 years old")).toEqual({
      name: "search_people",
      input: { died_age: 80, died_age_op: "gt" },
    });
    expect(routeAssistantMessage("find people who died over 80 years of age")).toEqual({
      name: "search_people",
      input: { died_age: 80, died_age_op: "gt" },
    });
    expect(routeAssistantMessage("people who died under 10 years old")).toEqual({
      name: "search_people",
      input: { died_age: 10, died_age_op: "lt" },
    });
    expect(
      routeAssistantMessage("Read the headstone on plot A 4 (id plot_1)."),
    ).toEqual({
      name: "read_headstone",
      input: { plot_id: "plot_1" },
    });
  });

  it("asks for the missing detail instead of calling the model", () => {
    expect(incompleteAssistantMessage("Search for people named")).toBe(
      "Type the name to search for.",
    );
    expect(routeAssistantMessage("Search for people named")).toBeNull();
    expect(incompleteAssistantMessage("add a new person")).toMatch(/plot on the map/);
    expect(incompleteAssistantMessage("people who died aged")).toMatch(/over 80/);
    expect(routeAssistantMessage("add a new person")).toBeNull();
  });

  it("groups repeated records of the same person", () => {
    const person = smith.people[0];
    const answer = formatToolResult(
      "search_people",
      JSON.stringify({
        ok: true,
        total: 2,
        people: [person, { ...person, id: "person_2" }],
        truncated: false,
      }),
    );
    expect(answer).toBe(
      "Found 1 person:\n- Ada Smith (1840-01-02 – 1901-03-04) — 2 records",
    );
  });

  it("shows a tool error", () => {
    expect(
      formatToolResult(
        "search_people",
        JSON.stringify({ ok: false, error: "Choose a cemetery first." }),
      ),
    ).toBe("Choose a cemetery first.");
  });
});
