import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { toCsv } from "./csv";

describe("toCsv", () => {
  it("quotes commas, quotes and newlines", () => {
    const csv = toCsv([{ header: "Name", value: (row: { n: string }) => row.n }], [{ n: 'A, "B"' }, { n: "x\ny" }]);
    assert.equal(csv, 'Name\r\n"A, ""B"""\r\n"x\ny"');
  });

  it("prefixes formula-like text but leaves numbers alone", () => {
    const csv = toCsv(
      [
        { header: "Text", value: (row: { t: string; n: number }) => row.t },
        { header: "Num", value: (row) => row.n },
      ],
      [{ t: "=SUM(A1)", n: -3 }],
    );
    assert.equal(csv, "Text,Num\r\n'=SUM(A1),-3");
  });

  it("renders null and undefined as empty cells", () => {
    assert.equal(toCsv([{ header: "A", value: () => null }, { header: "B", value: () => undefined }], [1]), "A,B\r\n,");
  });
});
