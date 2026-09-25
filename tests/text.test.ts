import { describe, expect, it } from "vitest";
import { decodeEntities, fixMojibake, htmlToLine, htmlToText, splitOnHr } from "@/lib/easystaff/text";

describe("fixMojibake", () => {
  it("repairs the real double-encoded À from percorso_didattico", () => {
    expect(fixMojibake("SOSTENIBILITÃ\u0080 ENERGETICA")).toBe("SOSTENIBILITÀ ENERGETICA");
  });

  it("repairs common Italian accents", () => {
    expect(fixMojibake("perchÃ© cosÃ¬ Ã¨ giÃ\u00a0")).toBe("perché così è già");
    expect(fixMojibake("CapacitÃ ")).toBe("Capacità");
  });

  it("repairs cp1252 sequences (smart quotes, euro)", () => {
    expect(fixMojibake("lâ€™aula")).toBe("l’aula");
    expect(fixMojibake("10 â‚¬")).toBe("10 €");
  });

  it("repairs text encoded twice", () => {
    const once = "Ã\u0080"; // "À" read as latin1
    const twice = Array.from(new TextEncoder().encode(once), (b) => String.fromCharCode(b)).join("");
    expect(fixMojibake(twice)).toBe("À");
  });

  it("leaves correct text untouched", () => {
    for (const s of ["FESTIVITÀ", "Sospensione delle attività didattiche", "Università", "Ç Ñ Ó Ü °", "ASCII only"]) {
      expect(fixMojibake(s)).toBe(s);
    }
  });

  it("leaves invalid sequences untouched", () => {
    expect(fixMojibake("Ã ")).toBe("Ã ");
  });
});

describe("htmlToText", () => {
  it("converts <br> and <hr> to line breaks and strips tags", () => {
    expect(htmlToText("FESTIVITÀ:<br><br>lezioni non previste")).toBe("FESTIVITÀ:\nlezioni non previste");
    expect(htmlToText("A<hr style='border-top:1px solid #c6c6c6'>B")).toBe("A\nB");
    expect(htmlToText(' <i class="fa fa-asterisk" title="x"></i> ')).toBe("");
  });

  it("decodes entities", () => {
    expect(decodeEntities("pu&ograve; &amp; &#39;x&#x27;&nbsp;")).toBe("può & 'x' ");
    expect(htmlToLine("Nome&nbsp;&nbsp;<b>aula</b>")).toBe("Nome aula");
  });

  it("splits shared curricula on <hr>", () => {
    expect(
      splitOnHr("INGEGNERIA X [1] Laurea<hr style='border-top:1px solid #c6c6c6'>INGEGNERIA SOSTENIBILITÃ\u0080 [2]"),
    ).toEqual(["INGEGNERIA X [1] Laurea", "INGEGNERIA SOSTENIBILITÀ [2]"]);
  });
});
