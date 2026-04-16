import { describe, expect, it } from "vitest";
import { CookieJar } from "./cookie-jar";

describe("CookieJar", () => {
  describe("absorbOne", () => {
    it("parses a simple name=value; Path=/; HttpOnly header into just name+value", () => {
      const jar = new CookieJar();
      jar.absorbOne("sessionid=abc123; Path=/; HttpOnly");
      expect(jar.header()).toBe("sessionid=abc123");
    });

    it("ignores empty input", () => {
      const jar = new CookieJar();
      jar.absorbOne("");
      jar.absorbOne("   ");
      expect(jar.size).toBe(0);
    });

    it("ignores headers with no '=' separator", () => {
      const jar = new CookieJar();
      jar.absorbOne("not-a-cookie");
      jar.absorbOne("weird; HttpOnly");
      expect(jar.size).toBe(0);
    });

    it("trims whitespace around the name", () => {
      const jar = new CookieJar();
      jar.absorbOne("  sessionid  =abc123");
      expect(jar.header()).toBe("sessionid=abc123");
    });

    it("allows empty values", () => {
      const jar = new CookieJar();
      jar.absorbOne("tracking=; Path=/");
      expect(jar.header()).toBe("tracking=");
      expect(jar.size).toBe(1);
    });
  });

  describe("absorb", () => {
    it("accepts an array of Set-Cookie headers", () => {
      const jar = new CookieJar();
      jar.absorb(["a=1; Path=/", "b=2; HttpOnly", "c=3; Secure; SameSite=Lax"]);
      expect(jar.size).toBe(3);
      expect(jar.header()).toBe("a=1; b=2; c=3");
    });

    it("overwrites existing cookies with the same name", () => {
      const jar = new CookieJar();
      jar.absorb(["sessionid=old", "sessionid=new"]);
      expect(jar.size).toBe(1);
      expect(jar.header()).toBe("sessionid=new");
    });

    it("is a no-op for an empty array", () => {
      const jar = new CookieJar();
      jar.absorb([]);
      expect(jar.size).toBe(0);
    });
  });

  describe("header", () => {
    it("returns empty string when the jar is empty", () => {
      expect(new CookieJar().header()).toBe("");
    });

    it("is stable across repeated reads", () => {
      const jar = new CookieJar();
      jar.absorb(["a=1", "b=2"]);
      expect(jar.header()).toBe("a=1; b=2");
      expect(jar.header()).toBe("a=1; b=2");
    });

    it("preserves insertion order (Map semantics)", () => {
      const jar = new CookieJar();
      jar.absorb(["z=first", "a=second", "m=third"]);
      expect(jar.header()).toBe("z=first; a=second; m=third");
    });
  });
});
