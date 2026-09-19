import { describe, expect, it } from "vitest";
import { normalizeDateToIso } from "../../src/utils/inscriptionDates";

describe("normalizeDateToIso", () => {
  it("converts UK ordinal dates", () => {
    expect(normalizeDateToIso("25th June 1933")).toBe("1933-06-25");
    expect(normalizeDateToIso("1st October 2020")).toBe("2020-10-01");
    expect(normalizeDateToIso("2nd February 1948")).toBe("1948-02-02");
  });

  it("converts month-first US style", () => {
    expect(normalizeDateToIso("January 23 2009")).toBe("2009-01-23");
    expect(normalizeDateToIso("Feb 14, 1926")).toBe("1926-02-14");
  });

  it("keeps ISO dates", () => {
    expect(normalizeDateToIso("1933-06-25")).toBe("1933-06-25");
  });

  it("pads year-only dates", () => {
    expect(normalizeDateToIso("1895")).toBe("1895-01-01");
  });

  it("parses UK numeric dates", () => {
    expect(normalizeDateToIso("25/06/1933")).toBe("1933-06-25");
  });

  it("parses US dates with no space after the comma", () => {
    expect(normalizeDateToIso("April 24,1856")).toBe("1856-04-24");
  });

  it("parses colonial word-ordinal dates", () => {
    expect(normalizeDateToIso("May the first 1706")).toBe("1706-05-01");
    expect(normalizeDateToIso("the sixth day of August 1708")).toBe("1708-08-06");
  });
});
