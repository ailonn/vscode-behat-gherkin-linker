/**
 * Unit tests — Behat PHP docblock scanner (SPEC.md §5, `php.ts`).
 *
 * `scanPhp` is a pure, synchronous function: no I/O — the imperative shell
 * reads the file and passes the source. The tests (not the core) read the
 * fixtures from disk.
 *
 * Rules covered (one rule = tests): 1 FQCN · 2 docblock directly above the
 * method · 3 one annotation = one DefinitionRef (case-sensitive, verbatim
 * expression) · 4 multi-annotations · 5 parameters · 6 @Transform ·
 * 7 silence · 8 exact fixtures · 9 visibility · 10 two classes in one file —
 * plus the documented limitations (SPEC §4/§5).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scanPhp } from "../../src/core/php.js";
import type { DefinitionRef } from "../../src/core/types.js";

const FIXTURES = join(import.meta.dirname, "..", "fixtures");

function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), "utf8");
}

function php(...lines: string[]): string {
  return lines.join("\n");
}

function scan(source: string, path = "Steps.php"): DefinitionRef[] {
  return scanPhp(source, path);
}

describe("scanPhp — rule 1: FQCN", () => {
  it("namespace + class → qualified FQCN", () => {
    const source = php(
      "<?php",
      "namespace App\\Behat;",
      "class CommandeSteps",
      "{",
      "    /**",
      "     * @Given /je suis/",
      "     */",
      "    public function jeSuis()",
      "    {",
      "    }",
      "}"
    );
    const [def] = scan(source, "CommandeSteps.php");
    expect(def.fqcn).toBe("App\\Behat\\CommandeSteps");
    expect(def.method).toBe("jeSuis");
    expect(def.type).toBe("Given");
    expect(def.path).toBe("CommandeSteps.php");
  });

  it("no namespace (global space) → the class name alone", () => {
    const source = php(
      "<?php",
      "class LegacySteps",
      "{",
      "    /**",
      "     * @Given /je suis/",
      "     */",
      "    public function jeSuis()",
      "    {",
      "    }",
      "}"
    );
    const [def] = scan(source);
    expect(def.fqcn).toBe("LegacySteps");
  });
});

describe("scanPhp — rule 2: docblock directly above the method", () => {
  it("closing line immediately followed by the signature → indexed (line = 1-based line of the annotation)", () => {
    const source = php(
      "<?php",
      "class X",
      "{",
      "    /**",
      "     * @Given /je suis/",
      "     */",
      "    public function jeSuis()",
      "    {",
      "    }",
      "}"
    );
    const [def] = scan(source);
    expect(def.line).toBe(5); // 1-based : `<?php`=1 … annotation=5
    expect(def.method).toBe("jeSuis");
  });

  // Documented limitation (SPEC §5): the docblock must sit directly above the
  // method — a blank line between the closing line and the signature breaks
  // the link: the docblock is not indexed. An honest limitation, not a bug.
  it("docblock separated from its function by a blank line → not indexed (documented limitation)", () => {
    const source = php(
      "<?php",
      "class X",
      "{",
      "    /**",
      "     * @Given /je suis/",
      "     */",
      "",
      "    public function jeSuis()",
      "    {",
      "    }",
      "}"
    );
    expect(scan(source)).toEqual([]);
  });
});

describe("scanPhp — rule 3: one annotation = one DefinitionRef", () => {
  it("Behat is case-sensitive: @given is not an annotation", () => {
    const source = php(
      "<?php",
      "class X",
      "{",
      "    /**",
      "     * @given /je suis/",
      "     */",
      "    public function jeSuis()",
      "    {",
      "    }",
      "}"
    );
    expect(scan(source)).toEqual([]);
  });

  it("expression captured verbatim after the keyword, trimmed — regex and :param are NOT classified by the scanner (the lowercase keyword among them is ignored)", () => {
    const source = php(
      "<?php",
      "class T",
      "{",
      "    /**",
      "     * @Given /je suis \"(?P<login>[\\w.]+)\"/",
      "     * @when /quand je tape/",
      "     * @Then alors que :param",
      "     */",
      "    public function tous(string $login)",
      "    {",
      "    }",
      "}"
    );
    const defs = scan(source);
    expect(defs).toHaveLength(2);
    expect(defs[0].type).toBe("Given");
    expect(defs[0].line).toBe(5);
    expect(defs[0].expression).toBe('/je suis "(?P<login>[\\w.]+)"/');
    expect(defs[1].type).toBe("Then");
    expect(defs[1].line).toBe(7);
    expect(defs[1].expression).toBe("alors que :param");
    expect(defs.map((d) => d.method)).toEqual(["tous", "tous"]);
    expect(defs.map((d) => d.parameters)).toEqual([["login"], ["login"]]);
  });

  it("single-line docblock directly above the method: expression captured without the closing delimiter", () => {
    const source = php(
      "<?php",
      "namespace App\\Behat;",
      "class CommandeSteps",
      "{",
      '    /** @Given /je suis "(?P<login>[\\w.]+)"/ */',
      "    public function jeSuis(string $login)",
      "    {",
      "    }",
      "}"
    );
    const [def] = scan(source, "OneLineSteps.php");
    expect(def.line).toBe(5);
    expect(def.fqcn).toBe("App\\Behat\\CommandeSteps");
    expect(def.method).toBe("jeSuis");
    expect(def.parameters).toEqual(["login"]);
    expect(def.type).toBe("Given");
    expect(def.expression).toBe('/je suis "(?P<login>[\\w.]+)"/');
  });

  it("single-line docblock with a :param expression: expression captured without the closing delimiter", () => {
    const source = php(
      "<?php",
      "class CommandeSteps",
      "{",
      "    /** @When je paie la commande :numero */",
      "    public function jePaie(string $numero)",
      "    {",
      "    }",
      "}"
    );
    const [def] = scan(source);
    expect(def.line).toBe(4);
    expect(def.fqcn).toBe("CommandeSteps");
    expect(def.method).toBe("jePaie");
    expect(def.parameters).toEqual(["numero"]);
    expect(def.type).toBe("When");
    expect(def.expression).toBe("je paie la commande :numero");
  });
});

describe("scanPhp — rule 4: multi-annotations", () => {
  it("method carrying 2 annotations → 2 DefinitionRefs (same FQCN/method/parameters, distinct lines)", () => {
    const source = php(
      "<?php",
      "namespace App\\Behat;",
      "class CommandeSteps",
      "{",
      "    /**",
      "     * @When /je valide la commande \"(?P<numero>[\\w.]+)\"/",
      "     * @Then /la commande \"(?P<numero>[\\w.]+)\" est valide/",
      "     */",
      "    public function laCommandeValidee(string $numero)",
      "    {",
      "    }",
      "}"
    );
    const defs = scan(source);
    expect(defs).toHaveLength(2);
    expect(defs[0]).toMatchObject({
      line: 6,
      type: "When",
      fqcn: "App\\Behat\\CommandeSteps",
      method: "laCommandeValidee",
      parameters: ["numero"],
    });
    expect(defs[1]).toMatchObject({
      line: 7,
      type: "Then",
      fqcn: "App\\Behat\\CommandeSteps",
      method: "laCommandeValidee",
      parameters: ["numero"],
    });
  });
});

describe("scanPhp — rule 5: parameters", () => {
  function stepWith(signature: string): DefinitionRef[] {
    return scan(
      php(
        "<?php",
        "class X",
        "{",
        "    /**",
        "     * @Given /x/",
        "     */",
        `    ${signature}`,
        "    {",
        "    }",
        "}"
      )
    );
  }

  it("a typed parameter → its name", () => {
    const [def] = stepWith("public function jePaie(string $numero)");
    expect(def.parameters).toEqual(["numero"]);
  });

  it("several parameters in order (types, default values) → the names", () => {
    const [def] = stepWith('function multi(int $a, string $b = "x", array $c = [])');
    expect(def.parameters).toEqual(["a", "b", "c"]);
  });

  it("by-reference parameter → the name without &", () => {
    const [def] = stepWith("public function parRef(string &$numero)");
    expect(def.parameters).toEqual(["numero"]);
  });

  it("no parameter → []", () => {
    const [def] = stepWith("public function rien()");
    expect(def.parameters).toEqual([]);
  });
});

describe("scanPhp — rule 6: @Transform", () => {
  it("@Transform is parsed and carried by the definition (displayed, never evaluated)", () => {
    const source = php(
      "<?php",
      "namespace App\\Behat;",
      "class T",
      "{",
      "    /**",
      "     * @When je paie la commande :numero",
      "     * @Transform App\\Behat\\Transforms\\CommandeNumero",
      "     */",
      "    public function jePaie(string $numero)",
      "    {",
      "    }",
      "}"
    );
    const [def] = scan(source);
    expect(def.transform).toBe("App\\Behat\\Transforms\\CommandeNumero");
    expect(def.expression).toBe("je paie la commande :numero");
  });

  it("@Transform is carried by all definitions of the docblock", () => {
    const source = php(
      "<?php",
      "class T",
      "{",
      "    /**",
      "     * @Given a",
      "     * @Then b",
      "     * @Transform App\\T",
      "     */",
      "    public function deux()",
      "    {",
      "    }",
      "}"
    );
    const defs = scan(source);
    expect(defs).toHaveLength(2);
    expect(defs.map((d) => d.transform)).toEqual(["App\\T", "App\\T"]);
  });

  it("multiple @Transform in one docblock: the first wins (declared deviation, locked)", () => {
    const source = php(
      "<?php",
      "class T",
      "{",
      "    /**",
      "     * @Given a",
      "     * @Transform App\\First",
      "     * @Transform App\\Second",
      "     */",
      "    public function f()",
      "    {",
      "    }",
      "}"
    );
    const [def] = scan(source);
    expect(def.transform).toBe("App\\First");
  });
});

describe("scanPhp — rule 7: silence", () => {
  it("method without a step annotation → no DefinitionRef (docblock without a step annotation, method without a docblock, @And outside the StepType contract)", () => {
    const source = php(
      "<?php",
      "class S",
      "{",
      "    /**",
      "     * Simple docblock sans annotation de step.",
      "     */",
      "    public function sansAnnotation()",
      "    {",
      "    }",
      "",
      "    public function sansDocblock()",
      "    {",
      "    }",
      "",
      "    /**",
      "     * @And je ne compte pas",
      "     */",
      "    public function etNon()",
      "    {",
      "    }",
      "}"
    );
    expect(scan(source)).toEqual([]);
  });
});

describe("scanPhp — rule 8: exact fixtures", () => {
  it("CommandeSteps.php → 5 definitions (all values)", () => {
    const defs = scan(fixture("CommandeSteps.php"), "test/fixtures/CommandeSteps.php");
    expect(defs).toHaveLength(5);
    expect(defs).toEqual([
      { path: "test/fixtures/CommandeSteps.php", line: 8, fqcn: "App\\Behat\\CommandeSteps", method: "jeSuis", parameters: ["login"], type: "Given", expression: '/je suis "(?P<login>[\\w.]+)"/' },
      { path: "test/fixtures/CommandeSteps.php", line: 15, fqcn: "App\\Behat\\CommandeSteps", method: "laCommandeValidee", parameters: ["numero"], type: "When", expression: '/je valide la commande "(?P<numero>[\\w.-]+)"/' },
      { path: "test/fixtures/CommandeSteps.php", line: 16, fqcn: "App\\Behat\\CommandeSteps", method: "laCommandeValidee", parameters: ["numero"], type: "Then", expression: '/la commande "(?P<numero>[\\w.-]+)" est valide/' },
      { path: "test/fixtures/CommandeSteps.php", line: 23, fqcn: "App\\Behat\\CommandeSteps", method: "jePaie", parameters: ["numero"], type: "When", expression: "je paie la commande :numero", transform: "App\\Behat\\Transforms\\CommandeNumero" },
      { path: "test/fixtures/CommandeSteps.php", line: 31, fqcn: "App\\Behat\\CommandeSteps", method: "jeSuisLeClient", parameters: ["login"], type: "Given", expression: '/je suis le client "(?P<login>[\\w.]+)"/' },
    ]);
  });

  it("OrderSteps.php → 3 definitions (all values)", () => {
    const defs = scan(fixture("OrderSteps.php"), "test/fixtures/OrderSteps.php");
    expect(defs).toEqual([
      { path: "test/fixtures/OrderSteps.php", line: 8, fqcn: "App\\Behat\\OrderSteps", method: "iAm", parameters: ["login"], type: "Given", expression: '/I am "(?P<login>[\\w.]+)"/' },
      { path: "test/fixtures/OrderSteps.php", line: 15, fqcn: "App\\Behat\\OrderSteps", method: "iPayFor", parameters: ["numero"], type: "Given", expression: '/I pay for "(?P<numero>[\\w-]+)"/' },
      { path: "test/fixtures/OrderSteps.php", line: 22, fqcn: "App\\Behat\\OrderSteps", method: "iValidateOrder", parameters: ["order"], type: "When", expression: '/I validate order "(?P<order>[\\w-]+)"/' },
    ]);
  });

  it("BestellungSteps.php → 1 definition (all values)", () => {
    const defs = scan(fixture("BestellungSteps.php"), "test/fixtures/BestellungSteps.php");
    expect(defs).toEqual([
      { path: "test/fixtures/BestellungSteps.php", line: 8, fqcn: "App\\Behat\\BestellungSteps", method: "ichBin", parameters: ["login"], type: "Given", expression: '/ich bin "(?P<login>[\\w.]+)"/' },
    ]);
  });
});

describe("scanPhp — rule 9: visibility", () => {
  it("public / protected / private / no modifier — all indexed", () => {
    const source = php(
      "<?php",
      "class V",
      "{",
      "    /**",
      "     * @Given pub",
      "     */",
      "    public function aPublique()",
      "    {",
      "    }",
      "",
      "    /**",
      "     * @Given prot",
      "     */",
      "    protected function aProtegee()",
      "    {",
      "    }",
      "",
      "    /**",
      "     * @Given priv",
      "     */",
      "    private function aPrivee()",
      "    {",
      "    }",
      "",
      "    /**",
      "     * @Given sans",
      "     */",
      "    function aSansModificateur()",
      "    {",
      "    }",
      "}"
    );
    const defs = scan(source);
    expect(defs.map((d) => d.method)).toEqual(["aPublique", "aProtegee", "aPrivee", "aSansModificateur"]);
    expect(defs.map((d) => d.fqcn)).toEqual(["V", "V", "V", "V"]);
    expect(defs.map((d) => d.parameters)).toEqual([[], [], [], []]);
  });
});

describe("scanPhp — rule 10: two classes in one file", () => {
  it("each method is linked to ITS class", () => {
    const source = php(
      "<?php",
      "namespace App\\Behat;",
      "",
      "class Premiere",
      "{",
      "    /**",
      "     * @Given premier",
      "     */",
      "    public function une()",
      "    {",
      "    }",
      "}",
      "",
      "class Deuxieme",
      "{",
      "    /**",
      "     * @When deuxieme",
      "     */",
      "    public function deux()",
      "    {",
      "    }",
      "}"
    );
    const defs = scan(source);
    expect(defs.map((d) => [d.fqcn, d.method])).toEqual([
      ["App\\Behat\\Premiere", "une"],
      ["App\\Behat\\Deuxieme", "deux"],
    ]);
  });
});

describe("scanPhp — documented limitations (SPEC §4/§5)", () => {
  it("a final class is indexed (final/abstract modifiers tolerated)", () => {
    const source = php(
      "<?php",
      "final class FinalSteps",
      "{",
      "    /**",
      "     * @Given /x/",
      "     */",
      "    public function f()",
      "    {",
      "    }",
      "}"
    );
    const [def] = scan(source);
    expect(def.fqcn).toBe("FinalSteps");
    expect(def.method).toBe("f");
  });

  it("an abstract class is indexed (final/abstract modifiers tolerated)", () => {
    const source = php(
      "<?php",
      "abstract class AbstractSteps",
      "{",
      "    /**",
      "     * @Given /x/",
      "     */",
      "    public function f()",
      "    {",
      "    }",
      "}"
    );
    const [def] = scan(source);
    expect(def.fqcn).toBe("AbstractSteps");
    expect(def.method).toBe("f");
  });

  it("an annotated top-level function (outside a class) is not indexed — a step is a method", () => {
    const source = php(
      "<?php",
      "namespace App\\Behat;",
      "",
      "/**",
      " * @Given orpheline",
      " */",
      "function orpheline()",
      "{",
      "}"
    );
    expect(scan(source)).toEqual([]);
  });

  it("a docblock followed by a non-function line (property) is not indexed", () => {
    const source = php(
      "<?php",
      "class X",
      "{",
      "    /**",
      "     * @Given x",
      "     */",
      "    private $prop;",
      "}"
    );
    expect(scan(source)).toEqual([]);
  });

  // Contract lock (already delivered behaviour): an unclosed `/**` is not a
  // docblock — it is not indexed, and the scan continues past it.
  it("an unclosed docblock (no closing line at all) is not indexed", () => {
    const source = php(
      "<?php",
      "class X",
      "{",
      "    /**",
      "     * @Given orpheline",
      "    public function f()",
      "    {",
      "    }",
      "}"
    );
    expect(scan(source)).toEqual([]);
  });
});
