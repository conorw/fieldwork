import { describe, expect, it } from "vitest";
import {
  inferStaffStoneKind,
  parseNotesExtras,
  parseReasoningJson,
  personDataToConfirmInputs,
  personsToReasoningTarget,
  reasoningTargetToPersons,
  staffKindToStoneType,
} from "../../src/utils/reasoningMapper";
import { evaluateTrainingCoverage } from "../../src/utils/trainingCoverage";
import {
  MIN_TRAINING_EXAMPLES,
  MIN_TRAINING_EXAMPLES_WITH_GLOBAL,
} from "../../src/types/headstoneTraining";

describe("reasoningMapper", () => {
  it("maps confirmed people to reasoning target", () => {
    const target = personsToReasoningTarget(
      [
        {
          full_name: "Jane Smith",
          date_of_birth: "1920",
          date_of_death: "1998",
        },
        {
          full_name: "John Smith",
          date_of_birth: "1918",
          date_of_death: "2001",
        },
      ],
      { stoneKind: "couple", notes: "In loving memory" },
    );
    expect(target.people).toHaveLength(2);
    expect(target.people[0].role_on_stone).toBe("primary");
    expect(target.people[1].role_on_stone).toBe("spouse");
    expect(target.people[0].position).toBe("left");
    expect(target.shared.surname).toBe("Smith");
  });

  it("round-trips reasoning → persons", () => {
    const target = personsToReasoningTarget(
      [{ full_name: "Ada Lovelace", date_of_death: "1852" }],
      { stoneKind: "one_person" },
    );
    const persons = reasoningTargetToPersons(target, "plot-1");
    expect(persons[0].full_name).toBe("Ada Lovelace");
    expect(persons[0].plot_id).toBe("plot-1");
    expect(persons[0].date_of_death).toBe("1852-01-01");
  });

  it("parses legacy persons JSON", () => {
    const text = JSON.stringify({
      full_text_transcription: "Hello",
      persons: [{ forename: "Ann", surname: "Lee", date_of_death: "1901" }],
    });
    const target = parseReasoningJson(text);
    expect(target.people[0].full_name).toContain("Ann");
    expect(target.notes).toBe("Hello");
  });

  it("parses a legacy stones array", () => {
    const target = parseReasoningJson(
      JSON.stringify({
        stones: [
          {
            name: "Dennis William Fone",
            age: 87,
            date: "25th June 1933 - 1st October 2020",
          },
          {
            name: "Beryl Jean Fone",
            date: "2nd February 1948 - 1st November 2021",
          },
        ],
      }),
    );
    expect(target.people).toHaveLength(2);
    expect(target.people[0].full_name).toBe("Dennis William Fone");
    expect(target.people[0].dates.birth).toBe("1933-06-25");
    expect(target.people[0].dates.death).toBe("2020-10-01");
    expect(target.shared.surname).toBe("Fone");
  });

  it("recovers a person from truncated stones JSON", () => {
    const target = parseReasoningJson(
      '{"stones":[{"name":"Dennis William Fone","age":87,' +
        '"date":"25th June 1933 - 1st October 2020",' +
        '"occupation":"dear husband","occupation":"dear',
    );
    expect(target.people).toHaveLength(1);
    expect(target.people[0].full_name).toBe("Dennis William Fone");
    expect(target.people[0].dates.death).toBe("2020-10-01");
  });

  it("parses the compact stock-model schema", () => {
    const target = parseReasoningJson(
      JSON.stringify({
        people: [
          {
            full_name: "Dennis William Fone",
            birth: "25th June 1933",
            death: "1st October 2020",
          },
          {
            full_name: "Beryl Jean Fone",
            birth: "2nd February 1948",
            death: "1st November 2021",
          },
        ],
        transcription: "With love we remember",
      }),
    );
    expect(target.people).toHaveLength(2);
    expect(target.people[1].full_name).toBe("Beryl Jean Fone");
    expect(target.people[1].dates.death).toBe("2021-11-01");
    expect(target.notes).toBe("With love we remember");
  });

  it("recovers a malformed full_name key from stock output", () => {
    const target = parseReasoningJson(
      '{"people":[{"full_nameplex="Dennis William Fone" {' +
        '"dear_husband":null}',
    );
    expect(target.people).toHaveLength(1);
    expect(target.people[0].full_name).toBe("Dennis William Fone");
  });

  it("fills missing birth and death from the inscription transcription", () => {
    const target = parseReasoningJson(
      JSON.stringify({
        people: [
          { full_name: "Dennis William Fone", birth: "", death: "" },
          { full_name: "Beryl Jean Fone", birth: "", death: "" },
        ],
        transcription:
          "DENNIS WILLIAM FONE\n25th June 1933\n1st October 2020\n" +
          "BERYL JEAN FONE\n2nd February 1948\n1st November 2021",
      }),
    );
    expect(target.people[0].dates.birth).toBe("1933-06-25");
    expect(target.people[0].dates.death).toBe("2020-10-01");
    expect(target.people[1].dates.birth).toBe("1948-02-02");
    expect(target.people[1].dates.death).toBe("2021-11-01");
  });

  it("maps dob/dod aliases into dates", () => {
    const target = parseReasoningJson(
      JSON.stringify({
        people: [
          {
            full_name: "Ada Lovelace",
            dob: "10 December 1815",
            dod: "27 November 1852",
          },
        ],
      }),
    );
    expect(target.people[0].dates.birth).toBe("1815-12-10");
    expect(target.people[0].dates.death).toBe("1852-11-27");
  });

  it("infers staff stone kinds", () => {
    expect(inferStaffStoneKind(1)).toBe("one_person");
    expect(inferStaffStoneKind(2)).toBe("couple");
    expect(inferStaffStoneKind(4)).toBe("family");
    expect(staffKindToStoneType("couple")).toBe("couple");
  });

  it("parses relationships and occupation from notes", () => {
    const parsed = parseNotesExtras(
      "A dear husband; Occupation: blacksmith; Always missed",
    );
    expect(parsed.relationships).toContain("A dear husband");
    expect(parsed.occupation).toBe("blacksmith");
    expect(parsed.notesRest).toContain("Always missed");
  });

  it("maps Fone-style fields into training target", () => {
    const inputs = personDataToConfirmInputs([
      {
        id: "",
        plot_id: "",
        full_name: "Dennis William Fone",
        forename: "Dennis William",
        surname: "Fone",
        date_of_birth: "1933-06-25",
        date_of_death: "2020-10-01",
        notes: "A dear husband",
      } as any,
      {
        id: "",
        plot_id: "",
        full_name: "Beryl Jean Fone",
        forename: "Beryl Jean",
        surname: "Fone",
        date_of_birth: "1948-02-02",
        date_of_death: "2021-11-01",
        notes: "A dear wife and mother",
      } as any,
    ]);
    expect(inputs[0].relationships).toContain("A dear husband");
    expect(inputs[1].relationships?.[0]).toMatch(/wife/i);

    const target = personsToReasoningTarget(inputs, {
      stoneKind: "couple",
      epitaph: "With love we remember · Always missed, never forgotten",
      notes: "With love we remember\n...",
    });
    expect(target.people[0].relationships).toContain("A dear husband");
    expect(target.shared.epitaph).toMatch(/With love/i);
  });
  it("includes physical monument attrs in training target", () => {
    const target = personsToReasoningTarget(
      [{ full_name: "Dennis William Fone", date_of_death: "2020-10-01" }],
      {
        stoneKind: "couple",
        physical: {
          material: "granite",
          form: "arched",
          condition: "new",
          detail: "polished dark grey, fresh soil",
        },
      },
    );
    expect(target.physical?.material).toBe("granite");
    expect(target.physical?.form).toBe("arched");
    expect(target.physical?.condition).toBe("new");
    expect(target.physical?.detail).toMatch(/polished/i);
  });

  it("parses physical attrs from reasoning JSON", () => {
    const text = JSON.stringify({
      people: [{ full_name: "Ada", role_on_stone: "primary", position: "center" }],
      shared: { surname: "", epitaph: "" },
      physical: {
        material: "marble",
        form: "ledger",
        condition: "weathered",
        detail: "",
      },
    });
    const target = parseReasoningJson(text);
    expect(target.physical?.material).toBe("marble");
    expect(target.physical?.form).toBe("ledger");
    expect(target.physical?.condition).toBe("weathered");
  });
});

describe("trainingCoverage", () => {
  it("cold-start requires 15 examples and variety", () => {
    const notReady = evaluateTrainingCoverage({
      total: 14,
      byStoneType: { single: 10, couple: 4 },
      hasGlobalAdapter: false,
    });
    expect(notReady.ready).toBe(false);
    expect(notReady.requiredTotal).toBe(MIN_TRAINING_EXAMPLES);

    const ready = evaluateTrainingCoverage({
      total: 15,
      byStoneType: { single: 5, couple: 5, family: 5 },
      hasGlobalAdapter: false,
    });
    expect(ready.ready).toBe(true);
  });

  it("with global adapter, fewer examples suffice", () => {
    const status = evaluateTrainingCoverage({
      total: MIN_TRAINING_EXAMPLES_WITH_GLOBAL,
      byStoneType: { single: 2, couple: 2, weathered: 2 },
      hasGlobalAdapter: true,
    });
    expect(status.requiredTotal).toBe(MIN_TRAINING_EXAMPLES_WITH_GLOBAL);
    expect(status.ready).toBe(true);
  });
});
