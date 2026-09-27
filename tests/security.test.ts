import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";
import { parseRouteQuery, stringifyRouteQuery } from "../src/router/index.js";
import { setAttribute } from "../src/runtime/dom.js";
import { renderAttr, renderAttrs } from "../src/server.js";

describe("attribute and query security", () => {
  it("does not serialize inline event handlers or malformed attribute names", () => {
    for (const name of ["onclick", "onerror", "OnLoad", "onanimationstart", "bad\u0000name"]) {
      expect(renderAttr(name, "alert(1)")).toBe("");
    }
    expect(renderAttrs({ title: "safe", onerror: "alert(1)" })).toBe(' title="safe"');
  });

  it("rejects inline event attributes in every DOM binding mode", () => {
    const element = new Window().document.createElement("img") as unknown as Element;
    for (const options of [{}, { attribute: true }, { property: true }]) {
      setAttribute(element, "onerror", "alert(1)", options);
      expect(element.hasAttribute("onerror")).toBe(false);
      expect((element as HTMLImageElement).onerror).toBeNull();
    }
  });

  it("does not allow property bindings to replace DOM prototypes", () => {
    const element = new Window().document.createElement("div") as unknown as Element;
    const prototype = Object.getPrototypeOf(element);
    setAttribute(element, "__proto__", { polluted: true }, { property: true });
    expect(Object.getPrototypeOf(element)).toBe(prototype);
  });

  it("keeps prototype-like query keys as ordinary own string values", () => {
    const query = parseRouteQuery("__proto__=a&__proto__=b&constructor=c&toString=d&hasOwnProperty=e");
    expect(Object.getPrototypeOf(query)).toBe(Object.prototype);
    expect(Object.hasOwn(query, "__proto__")).toBe(true);
    expect(query["__proto__"]).toEqual(["a", "b"]);
    expect(query["constructor"]).toBe("c");
    expect(query["toString"]).toBe("d");
    expect(query["hasOwnProperty"]).toBe("e");
    expect(stringifyRouteQuery(query)).toBe("?__proto__=a&__proto__=b&constructor=c&toString=d&hasOwnProperty=e");
  });
});
