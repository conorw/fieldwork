import { describe, expect, it } from "vitest";
import { createAgentToolRegistry } from "../src/services/agentTools/registry";
import { graveFootprint } from "../src/services/agentTools/graveFootprint";
import {
  createFieldTools,
  type FieldToolDeps,
  type PlotSummary,
} from "../src/services/agentTools/fieldTools";

const cemetery = { id: "loc_1", name: "St Mary" };

function plot(overrides: Partial<PlotSummary> = {}): PlotSummary {
  return {
    id: "plot_1",
    location_id: cemetery.id,
    section: "A",
    row: "1",
    number: "4",
    status: "Active",
    notes: "",
    geometry: JSON.stringify(graveFootprint(55.2, -1.6, "single")),
    ...overrides,
  };
}

function deps(overrides: Partial<FieldToolDeps> = {}): FieldToolDeps {
  return {
    getSelectedCemetery: () => cemetery,
    listPlots: async () => [plot()],
    getPlot: async (id) => (id === "plot_1" ? plot() : null),
    getPeopleOnPlot: async () => [],
    searchPeople: async () => [
      {
        id: "person_1",
        plot_id: "plot_1",
        full_name: "Ada Smith",
        forename: "Ada",
        surname: "Smith",
      },
    ],
    focusCemetery: async () => ({ ok: true }),
    focusPlot: async () => ({ ok: true }),
    updatePlot: async (id, patch) => plot({ id, ...patch }),
    addPerson: async () => {
      throw new Error("not used");
    },
    getGps: async () => ({ latitude: 55.2, longitude: -1.6 }),
    nextPlotNumber: async () => "12",
    createPlot: async (input) => ({
      id: "plot_new",
      number: input.number,
      section: input.section,
      row: input.row,
      geometry: input.geometry,
    }),
    beginDrawing: async () => ({ ok: true, drawing: true }),
    readHeadstone: async () => ({ persons: [], transcription: "" }),
    ...overrides,
  };
}

describe("agent tool registry", () => {
  it("rejects a search that omits the required query", async () => {
    let called = false;
    const registry = createAgentToolRegistry(
      createFieldTools(
        deps({
          searchPeople: async () => {
            called = true;
            return [];
          },
        }),
      ),
    );

    const result = await registry.execute("search_people", {});

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/query/);
    expect(called).toBe(false);
  });

  it("refuses to change plot geometry", async () => {
    let called = false;
    const registry = createAgentToolRegistry(
      createFieldTools(
        deps({
          updatePlot: async () => {
            called = true;
            return plot();
          },
        }),
      ),
    );

    const result = await registry.execute("update_plot", {
      plot_id: "plot_1",
      geometry: "[[0,0],[1,0],[1,1],[0,0]]",
      notes: "lichen on the base",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/geometry/i);
    expect(called).toBe(false);
  });

  it("creates a closed GPS grave rectangle and does not accept a supplied outline", async () => {
    const created: { geometry: string; location_id: string; number: string }[] =
      [];
    let focused = 0;
    const registry = createAgentToolRegistry(
      createFieldTools(
        deps({
          createPlot: async (input) => {
            created.push(input);
            return {
              id: "plot_new",
              number: input.number,
              geometry: input.geometry,
            };
          },
          focusPlot: async () => {
            focused += 1;
            return { ok: true };
          },
        }),
      ),
    );

    const rejected = await registry.execute("create_plot_at_gps", {
      size: "single",
      geometry: "{\"type\":\"Polygon\"}",
    });
    expect(rejected.ok).toBe(false);
    expect(created).toHaveLength(0);

    const result = await registry.execute("create_plot_at_gps", {
      size: "double",
    });

    expect(result.ok).toBe(true);
    expect(created).toHaveLength(1);
    expect(created[0].location_id).toBe(cemetery.id);
    expect(created[0].number).toBe("12");
    const geometry = JSON.parse(created[0].geometry);
    expect(geometry.type).toBe("Polygon");
    expect(geometry.coordinates[0]).toHaveLength(5);
    expect(geometry.coordinates[0][0]).toEqual(geometry.coordinates[0][4]);
    expect(focused).toBe(1);
    expect(result.plot).toMatchObject({ id: "plot_new", size: "double" });
  });

  it("does not invent a plot when GPS is unavailable", async () => {
    let created = 0;
    const registry = createAgentToolRegistry(
      createFieldTools(
        deps({
          getGps: async () => null,
          createPlot: async () => {
            created += 1;
            return { id: "plot_new" };
          },
        }),
      ),
    );

    const result = await registry.execute("create_plot_at_gps", {
      size: "single",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/GPS is unavailable/);
    expect(created).toBe(0);
  });

  it("filters people by the year they died", async () => {
    const registry = createAgentToolRegistry(
      createFieldTools(
        deps({
          searchPeople: async () => [
            {
              id: "person_1",
              plot_id: "plot_1",
              full_name: "Beryl Fone",
              surname: "Fone",
              date_of_death: "1948-02-02",
            },
            {
              id: "person_2",
              plot_id: "plot_1",
              full_name: "Dennis Fone",
              surname: "Fone",
              date_of_death: "2020-10-01",
            },
          ],
        }),
      ),
    );

    const result = await registry.execute("search_people", { died_year: "1948" });

    expect(result.ok).toBe(true);
    expect(result.people).toHaveLength(1);
    expect(result.people).toMatchObject([{ full_name: "Beryl Fone" }]);
  });

  it("keeps people who died older than a given age", async () => {
    const registry = createAgentToolRegistry(
      createFieldTools(
        deps({
          searchPeople: async () => [
            {
              id: "person_1",
              plot_id: "plot_1",
              full_name: "Beryl Fone",
              surname: "Fone",
              date_of_birth: "1860-01-01",
              date_of_death: "1948-02-02",
            },
            {
              id: "person_2",
              plot_id: "plot_1",
              full_name: "Ada Young",
              surname: "Young",
              date_of_birth: "1900-06-01",
              date_of_death: "1948-02-02",
            },
            {
              id: "person_3",
              plot_id: "plot_1",
              full_name: "Unknown Dates",
              surname: "Dates",
            },
          ],
        }),
      ),
    );

    const result = await registry.execute("search_people", {
      died_age: 80,
      died_age_op: "gt",
    });

    expect(result.ok).toBe(true);
    expect(result.people).toMatchObject([{ full_name: "Beryl Fone", age: 88 }]);
    expect(result.undated).toBe(1);
  });

  it("reads an age out of the search wording", async () => {
    const registry = createAgentToolRegistry(
      createFieldTools(
        deps({
          searchPeople: async (query) => {
            expect(query).toBe("");
            return [
              {
                id: "person_1",
                plot_id: "plot_1",
                full_name: "Beryl Fone",
                surname: "Fone",
                date_of_birth: "1860-01-01",
                date_of_death: "1948-02-02",
              },
            ];
          },
        }),
      ),
    );

    const result = await registry.execute("search_people", {
      query: "find people who died over 80 years of age",
    });

    expect(result.ok).toBe(true);
    expect(result.died_age).toBe(80);
    expect(result.died_age_op).toBe("gt");
    expect(result.people).toMatchObject([{ full_name: "Beryl Fone", age: 88 }]);
  });

  it("maps tool execution through the language-model binding", async () => {
    const registry = createAgentToolRegistry(createFieldTools(deps()));
    const search = registry
      .toLanguageModelTools()
      .find((tool) => tool.name === "search_people");

    const raw = await search?.execute({ query: "smith" });
    const parsed = JSON.parse(raw ?? "{}");

    expect(parsed.ok).toBe(true);
    expect(parsed.people[0]).toMatchObject({
      full_name: "Ada Smith",
      surname: "Smith",
    });
  });

  it("makes a double grave taller than a single grave at the same point", () => {
    const single = graveFootprint(55.2, -1.6, "single");
    const double = graveFootprint(55.2, -1.6, "double");
    const height = (ring: number[][]) => ring[2][1] - ring[0][1];
    expect(height(double.coordinates[0])).toBeGreaterThan(
      height(single.coordinates[0]),
    );
  });
});
