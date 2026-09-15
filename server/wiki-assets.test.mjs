import { describe, expect, it } from "vitest";
import {
  buildManifestEntry,
  classifyTitle,
  diffManifest,
  displayNameFromTitle,
  fetchWikiEntries,
  fetchWikiImage,
  isAllowedWikiUrl,
  needsDownload,
  sortManifest,
  stratagemKindFromSvg,
  wikiFileName,
} from "./wiki-assets.mjs";

const makeEntry = (title, overrides = {}) => ({
  title,
  url: `https://helldivers.wiki.gg/images/${wikiFileName(title)}?abc123`,
  thumbUrl: null,
  mime: "image/svg+xml",
  size: 1000,
  width: 512,
  height: 512,
  descriptionUrl: null,
  ...overrides,
});

describe("classifyTitle", () => {
  it("classifies stratagem icons", () => {
    expect(classifyTitle("File:Eagle Gas Airstrike Stratagem Icon Background.svg")).toEqual({
      category: "stratagems",
      slot: null,
    });
  });

  it("classifies weapon renders by slot suffix", () => {
    expect(classifyTitle("File:AR-23 Liberator Primary Render.png")).toEqual({ category: "weapons", slot: "primary" });
    expect(classifyTitle("File:P-4 Senator Secondary Render.png")).toEqual({ category: "weapons", slot: "secondary" });
    expect(classifyTitle("File:G-12 High Explosive Throwable Render.png")).toEqual({ category: "weapons", slot: "grenade" });
  });

  it("skips support renders, armor icons, enemy icons, and junk", () => {
    expect(classifyTitle("File:AC-8 Autocannon Support Render.png")).toBeNull();
    expect(classifyTitle("File:Armor AP9 Icon.png")).toBeNull();
    expect(classifyTitle("File:Bile Titan Enemy Icon.png")).toBeNull();
    expect(classifyTitle("File:Automaton icon.svg")).toBeNull();
    expect(classifyTitle(undefined)).toBeNull();
  });

  it("classifies only the three known faction icons", () => {
    expect(classifyTitle("File:Automaton Icon.svg")).toEqual({ category: "factions", slot: null });
    expect(classifyTitle("File:Terminid Icon.svg")).toEqual({ category: "factions", slot: null });
    expect(classifyTitle("File:Illuminate Icon.svg")).toEqual({ category: "factions", slot: null });
  });
});

describe("wikiFileName", () => {
  it("reproduces the existing manifest naming convention", () => {
    expect(wikiFileName("File:Airburst Rocket Launcher Stratagem Icon Background.svg")).toBe(
      "Airburst_Rocket_Launcher_Stratagem_Icon_Background.svg",
    );
    expect(wikiFileName("File:SG-225SP Breaker Spray&Pray Primary Render.png")).toBe(
      "SG-225SP_Breaker_Spray%26Pray_Primary_Render.png",
    );
  });
});

describe("displayNameFromTitle", () => {
  it("strips the category suffix", () => {
    expect(displayNameFromTitle("File:Eagle Gas Airstrike Stratagem Icon Background.svg")).toBe("Eagle Gas Airstrike");
    expect(displayNameFromTitle("File:AR-23 Liberator Primary Render.png")).toBe("AR-23 Liberator");
    expect(displayNameFromTitle("File:G-12 High Explosive Throwable Render.png")).toBe("G-12 High Explosive");
  });
});

describe("stratagemKindFromSvg", () => {
  it("maps the first fill colour to a stratagem kind", () => {
    expect(stratagemKindFromSvg("<svg><style>.fil1 {fill:#190301}</style></svg>")).toBe("red");
    expect(stratagemKindFromSvg("<svg><style>.fil1 {fill:#011419}</style></svg>")).toBe("blue");
    expect(stratagemKindFromSvg("<svg><style>.fil1 {fill:#081901}</style></svg>")).toBe("green");
    expect(stratagemKindFromSvg("<svg><style>.fil1 {fill:#363426}</style></svg>")).toBe("yellow");
  });

  it("also accepts the attribute form and falls back to blue", () => {
    expect(stratagemKindFromSvg('<svg><polygon fill="#190301"/></svg>')).toBe("red");
    expect(stratagemKindFromSvg("<svg><polygon fill='#081901'/></svg>")).toBe("green");
    expect(stratagemKindFromSvg('<svg><polygon fill = "#363426"/></svg>')).toBe("yellow");
    expect(stratagemKindFromSvg('<svg><polygon fill="#FFFFFF"/></svg>')).toBe("blue");
    expect(stratagemKindFromSvg("")).toBe("blue");
  });
});

describe("buildManifestEntry", () => {
  it("builds an entry matching the existing manifest shape", () => {
    const entry = buildManifestEntry(makeEntry("File:Eagle Gas Airstrike Stratagem Icon Background.svg"));

    expect(entry).toEqual({
      category: "stratagems",
      title: "File:Eagle Gas Airstrike Stratagem Icon Background.svg",
      aliases: ["File:Eagle Gas Airstrike Stratagem Icon Background.svg"],
      file: "assets/wiki/stratagems/Eagle_Gas_Airstrike_Stratagem_Icon_Background.svg",
      sourceUrl: "https://helldivers.wiki.gg/images/Eagle_Gas_Airstrike_Stratagem_Icon_Background.svg?abc123",
      descriptionUrls: ["https://helldivers.wiki.gg/wiki/File:Eagle_Gas_Airstrike_Stratagem_Icon_Background.svg"],
      mime: "image/svg+xml",
      width: 512,
      height: 512,
      size: 1000,
    });
  });

  it("returns null for unmanaged titles", () => {
    expect(buildManifestEntry(makeEntry("File:AC-8 Autocannon Support Render.png"))).toBeNull();
    expect(buildManifestEntry({ title: "File:X Stratagem Icon Background.svg" })).toBeNull();
  });
});

describe("sortManifest", () => {
  it("orders factions, then stratagems, then weapons, each by title", () => {
    const sorted = sortManifest([
      { category: "weapons", title: "File:B Render.png" },
      { category: "stratagems", title: "File:B Icon Background.svg" },
      { category: "factions", title: "File:Z Icon.svg" },
      { category: "stratagems", title: "File:A Icon Background.svg" },
    ]);

    expect(sorted.map((entry) => entry.title)).toEqual([
      "File:Z Icon.svg",
      "File:A Icon Background.svg",
      "File:B Icon Background.svg",
      "File:B Render.png",
    ]);
  });
});

describe("diffManifest", () => {
  const existing = [
    { title: "File:Kept Stratagem Icon Background.svg", size: 10, sourceUrl: "u1", category: "stratagems" },
    { title: "File:Bumped Primary Render.png", size: 10, sourceUrl: "u2", category: "weapons" },
    { title: "File:Dropped Stratagem Icon Background.svg", size: 10, sourceUrl: "u3", category: "stratagems" },
    { title: "File:Armor AP9 Icon.png", size: 10, sourceUrl: "u4", category: "weapons" },
  ];

  it("splits entries into added, updated, unchanged, removed, and unmanaged", () => {
    const next = [
      { title: "File:Kept Stratagem Icon Background.svg", size: 10, sourceUrl: "u1", category: "stratagems" },
      { title: "File:Bumped Primary Render.png", size: 99, sourceUrl: "u2-new", category: "weapons" },
      { title: "File:Brand New Stratagem Icon Background.svg", size: 10, sourceUrl: "u5", category: "stratagems" },
    ];

    const diff = diffManifest(existing, next);

    expect(diff.added.map((entry) => entry.title)).toEqual(["File:Brand New Stratagem Icon Background.svg"]);
    expect(diff.updated.map((entry) => entry.title)).toEqual(["File:Bumped Primary Render.png"]);
    expect(diff.unchanged.map((entry) => entry.title)).toEqual(["File:Kept Stratagem Icon Background.svg"]);
    expect(diff.removed.map((entry) => entry.title)).toEqual(["File:Dropped Stratagem Icon Background.svg"]);
    expect(diff.unmanaged.map((entry) => entry.title)).toEqual(["File:Armor AP9 Icon.png"]);
  });

  it("treats categories outside the scope as preserved instead of removed", () => {
    const next = [
      { title: "File:Kept Stratagem Icon Background.svg", size: 10, sourceUrl: "u1", category: "stratagems" },
    ];

    const scoped = diffManifest(existing, next, ["stratagems"]);

    expect(scoped.removed.map((entry) => entry.title)).toEqual(["File:Dropped Stratagem Icon Background.svg"]);
    expect(scoped.unmanaged.map((entry) => entry.title)).toEqual([
      "File:Bumped Primary Render.png",
      "File:Armor AP9 Icon.png",
    ]);
  });

  it("treats an identical sourceUrl and size as unchanged", () => {
    expect(needsDownload({ size: 5, sourceUrl: "a" }, { size: 5, sourceUrl: "a" })).toBe(false);
    expect(needsDownload({ size: 5, sourceUrl: "a" }, { size: 6, sourceUrl: "a" })).toBe(true);
    expect(needsDownload({ size: 5, sourceUrl: "a" }, { size: 5, sourceUrl: "b" })).toBe(true);
    expect(needsDownload(undefined, { size: 5, sourceUrl: "a" })).toBe(true);
  });
});

describe("isAllowedWikiUrl", () => {
  it("only allows https images paths on the wiki host", () => {
    expect(isAllowedWikiUrl("https://helldivers.wiki.gg/images/Foo.svg?abc")).toBe(true);
    expect(isAllowedWikiUrl("https://helldivers.wiki.gg/images/thumb/Foo.png/128px-Foo.png")).toBe(true);
    expect(isAllowedWikiUrl("http://helldivers.wiki.gg/images/Foo.svg")).toBe(false);
    expect(isAllowedWikiUrl("https://evil.example/images/Foo.svg")).toBe(false);
    expect(isAllowedWikiUrl("https://helldivers.wiki.gg/wiki/File:Foo.svg")).toBe(false);
    expect(isAllowedWikiUrl("file:///etc/passwd")).toBe(false);
    expect(isAllowedWikiUrl("not a url")).toBe(false);
  });
});

describe("fetchWikiEntries", () => {
  const jsonResponse = (body) => ({ ok: true, status: 200, json: async () => body });

  it("follows gimcontinue until exhausted and normalises fields", async () => {
    const urls = [];
    const fetchImpl = async (url) => {
      urls.push(String(url));
      const page = String(url).includes("gimcontinue") ? 2 : 1;
      if (page === 1) {
        return jsonResponse({
          query: { pages: [{ title: "File:A Stratagem Icon Background.svg", imageinfo: [{ url: "https://helldivers.wiki.gg/images/A.svg", mime: "image/svg+xml", size: 1, width: 512, height: 512, thumburl: "thumb-a" }] }] },
          continue: { gimcontinue: "556|B.svg" },
        });
      }
      return jsonResponse({
        query: { pages: [{ title: "File:B Stratagem Icon Background.svg", imageinfo: [{ url: "https://helldivers.wiki.gg/images/B.svg", mime: "image/svg+xml", size: 2, width: 512, height: 512 }] }] },
      });
    };

    const entries = await fetchWikiEntries({ fetchImpl, thumbWidth: 128 });

    expect(entries.map((entry) => entry.title)).toEqual([
      "File:A Stratagem Icon Background.svg",
      "File:B Stratagem Icon Background.svg",
    ]);
    expect(entries[0].thumbUrl).toBe("thumb-a");
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain("iiurlwidth=128");
    expect(urls[1]).toContain("gimcontinue=");
  });

  it("follows iicontinue when imageinfo results are paginated", async () => {
    const urls = [];
    const fetchImpl = async (url) => {
      urls.push(String(url));
      if (String(url).includes("iicontinue=")) {
        return jsonResponse({
          query: { pages: [{ title: "File:D Stratagem Icon Background.svg", imageinfo: [{ url: "https://helldivers.wiki.gg/images/D.svg", mime: "image/svg+xml", size: 4, width: 512, height: 512 }] }] },
        });
      }
      if (String(url).includes("iicontinue")) {
        return jsonResponse({
          query: { pages: [{ title: "File:C Stratagem Icon Background.svg", imageinfo: [{ url: "https://helldivers.wiki.gg/images/C.svg", mime: "image/svg+xml", size: 3, width: 512, height: 512 }] }] },
        });
      }
      return jsonResponse({
        query: { pages: [{ title: "File:C Stratagem Icon Background.svg", imageinfo: [{ url: "https://helldivers.wiki.gg/images/C.svg", mime: "image/svg+xml", size: 3, width: 512, height: 512 }] }] },
        continue: { iicontinue: "C.svg|20251222023519", continue: "||" },
      });
    };

    const entries = await fetchWikiEntries({ fetchImpl, thumbWidth: 128 });

    expect(entries).toHaveLength(2);
    expect(urls).toHaveLength(2);
    expect(urls[1]).toContain("iicontinue=");
  });

  it("retries a failing request and eventually succeeds", async () => {
    let attempts = 0;
    const fetchImpl = async () => {
      attempts += 1;
      if (attempts < 2) return { ok: false, status: 503, json: async () => ({}) };
      return jsonResponse({ query: { pages: [] } });
    };

    await fetchWikiEntries({ fetchImpl });

    expect(attempts).toBe(2);
  });

  it("reports a clear error after exhausting retries", async () => {
    const fetchImpl = async () => {
      throw new Error("getaddrinfo ENOTFOUND");
    };

    await expect(fetchWikiEntries({ fetchImpl, retries: 2 })).rejects.toThrow(/访问 helldivers\.wiki\.gg 失败/);
  });
});

describe("fetchWikiImage", () => {
  it("refuses a url outside the wiki images path", async () => {
    await expect(fetchWikiImage("https://evil.example/x.svg", { fetchImpl: async () => ({}) })).rejects.toThrow(
      "不允许的图标地址",
    );
  });

  it("returns the response body as a buffer", async () => {
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });

    const buffer = await fetchWikiImage("https://helldivers.wiki.gg/images/A.svg", { fetchImpl });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect([...buffer]).toEqual([1, 2, 3]);
  });
});
