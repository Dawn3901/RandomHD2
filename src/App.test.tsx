import { renderToString } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import App from "./App";
import { createMemoryStorage } from "./lib/storage";
import type { CustomItem } from "./types";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>';

const customStratagem: CustomItem = {
  id: "custom-render-1",
  kind: "stratagem",
  nameEn: "Meltagun",
  nameZh: "热熔枪",
  stratagemKind: "blue",
  category: "蓝色战备",
  svg: SVG,
  createdAt: 100,
};

function render(seed: Record<string, string> = {}) {
  (globalThis as unknown as { window: { localStorage: Storage } }).window = {
    localStorage: createMemoryStorage(seed),
  };
  return renderToString(<App />);
}

describe("App rendering", () => {
  beforeAll(() => {
    (globalThis as unknown as { window: { localStorage: Storage } }).window = {
      localStorage: createMemoryStorage(),
    };
  });

  it("renders the custom icon panel at the bottom of the page", () => {
    const html = render();

    expect(html).toContain("自定义图标");
    expect(html).toContain("上传并加入随机池");
    expect(html).toContain("显示已删除");
    expect(html).toContain("从 Wiki 导入");
    expect(html).toContain('accept=".svg,.png,image/svg+xml,image/png"');
  });

  it("renders built-in catalog counts", () => {
    const html = render();

    expect(html).toContain("可选战备");
    expect(html).toContain("随机池");
  });

  it("merges a stored custom stratagem into the random pool", () => {
    const html = render({ "randomhd2.customItems": JSON.stringify([customStratagem]) });

    expect(html).toContain("热熔枪");
    expect(html).toContain("自定义");
    expect(html).toContain("data:image/svg+xml;charset=utf-8,");
  });

  it("hides soft deleted custom items from the catalog but keeps them listed under 显示已删除", () => {
    const deleted: CustomItem = { ...customStratagem, nameZh: "测试隐藏战备", deletedAt: 500 };
    const html = render({ "randomhd2.customItems": JSON.stringify([deleted]) });

    expect(html).not.toContain("测试隐藏战备");
    expect(html).not.toContain("data:image/svg+xml;charset=utf-8,");
    expect(html).toContain("所有自定义图标都已删除");
  });

  it("renders a footer with the injected version and build time", () => {
    const html = render();

    expect(html).toContain('class="appFooter"');
    expect(html).toContain(`RandomHD2 v${__APP_VERSION__}`);
    expect(html).toMatch(/更新于 \d{4}\/\d{2}\/\d{2}/);
    expect(html).not.toContain("undefined");
  });

  it("keeps the footer as the last element on the page", () => {
    const html = render();

    expect(html.trimEnd().endsWith("</footer></main>")).toBe(true);
  });
});
