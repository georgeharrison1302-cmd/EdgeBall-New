import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeReferee } from "./referee-name";

describe("normalizeReferee", () => {
  it("removes API-Football country suffixes", () => {
    assert.equal(normalizeReferee("Michael Oliver, England"), "Michael Oliver");
  });

  it("treats null and placeholder assignments as unassigned", () => {
    for (const value of [null, "", "TBC", "TBD", "Unknown", "To be confirmed", "N/A"]) {
      assert.equal(normalizeReferee(value), null);
    }
  });
});
