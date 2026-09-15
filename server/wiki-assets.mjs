/**
 * Helldivers Wiki 图标清单的获取与解析。
 * 被 scripts/update-assets.mjs（更新内置目录）和 server/sync-server.mjs（网页导入按钮）共用。
 */

export const WIKI_ORIGIN = "https://helldivers.wiki.gg";
export const WIKI_API = `${WIKI_ORIGIN}/api.php`;
export const WIKI_HOST = "helldivers.wiki.gg";
export const WIKI_USER_AGENT = "RandomHD2/0.1 (local fan tool)";
export const WIKI_SOURCE_PAGES = "Stratagems|Weapons";

/**
 * 阵营图标不能从 Factions 页面取——那个页面返回的是各种敌人图标。
 * 只有这 3 个是目录里用到的，按文件名精确查询。
 */
export const FACTION_TITLES = [
  "File:Automaton Icon.svg",
  "File:Illuminate Icon.svg",
  "File:Terminid Icon.svg",
];

export const MANAGED_CATEGORIES = ["factions", "stratagems", "weapons"];

const STRATAGEM_TITLE = / Stratagem Icon Background\.svg$/i;

/**
 * 支援武器（Support Render）故意不收：它们在游戏里本来就是蓝色战备，
 * 而且已经有对应的战备图标，用武器渲染图会造成重复和分类混乱。
 */
const WEAPON_SLOT_PATTERNS = [
  { pattern: / Primary Render\.(png|svg)$/i, slot: "primary" },
  { pattern: / Secondary Render\.(png|svg)$/i, slot: "secondary" },
  { pattern: / Throwable Render\.(png|svg)$/i, slot: "grenade" },
];

const KIND_BY_COLOR = {
  "190301": "red",
  "011419": "blue",
  "081901": "green",
  "363426": "yellow",
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function classifyTitle(title) {
  if (typeof title !== "string") return null;
  if (STRATAGEM_TITLE.test(title)) return { category: "stratagems", slot: null };
  for (const { pattern, slot } of WEAPON_SLOT_PATTERNS) {
    if (pattern.test(title)) return { category: "weapons", slot };
  }
  if (FACTION_TITLES.includes(title)) return { category: "factions", slot: null };
  return null;
}

/** 与既有 manifest 的命名约定保持一致（空格转下划线、& 转 %26） */
export function wikiFileName(title) {
  return title.replace(/^File:/, "").replace(/ /g, "_").replace(/&/g, "%26");
}

/** 去掉文件名里的分类后缀，得到显示名（与 scripts/generate-data.mjs 的 cleanName 一致） */
export function displayNameFromTitle(title) {
  return title
    .replace(/^File:/, "")
    .replace(/\.(svg|png|webp|jpg|jpeg)$/i, "")
    .replace(/\s+Stratagem Icon Background$/i, "")
    .replace(/\s+(Primary|Secondary|Support|Throwable) Render$/i, "")
    .replace(/\s+Icon$/i, "")
    .trim();
}

/**
 * 从 SVG 的第一个 fill 颜色判断战备类别。
 * 真实图标把颜色写在 <style> 里（fill:#011419），这里同时兼容属性写法（fill="#011419"）。
 */
export function stratagemKindFromSvg(svg) {
  const match = String(svg).match(/fill\s*[:=]\s*["']?#([0-9a-fA-F]{6})/);
  return KIND_BY_COLOR[match?.[1]?.toLowerCase()] ?? "blue";
}

export function buildManifestEntry(entry) {
  const classified = classifyTitle(entry?.title);
  if (!classified || !entry.url) return null;

  const fileName = wikiFileName(entry.title);

  return {
    category: classified.category,
    title: entry.title,
    aliases: [entry.title],
    file: `assets/wiki/${classified.category}/${fileName}`,
    sourceUrl: entry.url,
    descriptionUrls: [`${WIKI_ORIGIN}/wiki/File:${fileName}`],
    mime: entry.mime,
    width: entry.width,
    height: entry.height,
    size: entry.size,
  };
}

const CATEGORY_ORDER = { factions: 0, stratagems: 1, weapons: 2 };

/**
 * 用纯码位比较而不是 localeCompare：后者的结果随 Node / ICU 版本和系统区域设置变化，
 * 会让 manifest 在不同机器上产生无意义的重排。这里保证任何环境都产出同一顺序。
 */
function compareTitles(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function sortManifest(entries) {
  return [...entries].sort((a, b) => {
    const byCategory = (CATEGORY_ORDER[a.category] ?? 9) - (CATEGORY_ORDER[b.category] ?? 9);
    if (byCategory !== 0) return byCategory;
    return compareTitles(a.title, b.title);
  });
}

/**
 * 需要重新下载的条目 = added + updated（体积或 sourceUrl 的 hash 变了）。
 * 未变化的条目一律跳过——武器原图单张就有 3MB 以上，不能每次全量重下。
 */
export function needsDownload(previous, next) {
  if (!previous) return true;
  return previous.size !== next.size || previous.sourceUrl !== next.sourceUrl;
}

/**
 * scope 限制本次管理的类别：--only=stratagems 时，武器条目会被当作「不归本次管」而原样保留，
 * 不会被误判成已删除。
 */
export function diffManifest(existing, next, scope = MANAGED_CATEGORIES) {
  const prevByTitle = new Map(existing.map((entry) => [entry.title, entry]));
  const nextTitles = new Set(next.map((entry) => entry.title));
  const inScope = (entry) => {
    const classified = classifyTitle(entry.title);
    return Boolean(classified) && scope.includes(classified.category);
  };

  return {
    added: next.filter((entry) => !prevByTitle.has(entry.title)),
    updated: next.filter((entry) => prevByTitle.has(entry.title) && needsDownload(prevByTitle.get(entry.title), entry)),
    unchanged: next.filter((entry) => prevByTitle.has(entry.title) && !needsDownload(prevByTitle.get(entry.title), entry)),
    // 我们认识、但 Wiki 上已经没有的条目
    removed: existing.filter((entry) => inScope(entry) && !nextTitles.has(entry.title)),
    // 不归本次管的条目（Armor_AP*_Icon.png，或 --only 之外的类别），原样保留
    unmanaged: existing.filter((entry) => !inScope(entry)),
  };
}

async function fetchWithRetry(url, { fetchImpl, retries, timeoutMs, accept }) {
  let lastError;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        headers: { "User-Agent": WIKI_USER_AGENT, accept },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (error) {
      lastError = error;
      await delay(300 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(`访问 ${WIKI_HOST} 失败：${lastError?.message || lastError}`);
}

function toEntry(item) {
  const info = item?.imageinfo?.[0];
  if (!info?.url || typeof item.title !== "string") return null;
  return {
    title: item.title,
    url: info.url,
    thumbUrl: info.thumburl ?? null,
    mime: info.mime,
    size: info.size,
    width: info.width,
    height: info.height,
    descriptionUrl: info.descriptionurl ?? null,
  };
}

function pagesOf(data) {
  const pages = data?.query?.pages;
  return Array.isArray(pages) ? pages : Object.values(pages || {});
}

/**
 * 拉取图标清单，自动跟随分页。
 *
 * byPage=true  ：generator=images，列出某个内容页面（Stratagems / Weapons）上用到的所有图片
 * byPage=false ：直接按文件标题查询（阵营图标用这种，Factions 页面返回的是敌人图标，不能用）
 *
 * 分页令牌不能只认 gimcontinue：带 iiurlwidth 时 MediaWiki 会改为分页 imageinfo 结果，
 * 返回的是 iicontinue。所以这里原样回传服务端给出的所有 continue 键。
 */
export async function fetchWikiEntries({
  fetchImpl = fetch,
  titles,
  byPage = true,
  thumbWidth = 0,
  pageSize = 500,
  maxPages = 40,
  retries = 3,
  timeoutMs = 20000,
} = {}) {
  const entries = [];
  const targetTitles = titles ?? (byPage ? WIKI_SOURCE_PAGES : FACTION_TITLES.join("|"));
  let continuation = null;

  for (let page = 0; page < maxPages; page += 1) {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      formatversion: "2",
      prop: "imageinfo",
      iiprop: "url|mime|size|dimensions",
      titles: targetTitles,
    });
    if (byPage) {
      params.set("generator", "images");
      params.set("gimlimit", String(pageSize));
    } else {
      params.set("iilimit", String(pageSize));
    }
    if (thumbWidth > 0) params.set("iiurlwidth", String(thumbWidth));
    if (continuation) {
      for (const [key, value] of Object.entries(continuation)) params.set(key, String(value));
    }

    const response = await fetchWithRetry(`${WIKI_API}?${params}`, {
      fetchImpl,
      retries,
      timeoutMs,
      accept: "application/json",
    });
    const data = await response.json();

    for (const item of pagesOf(data)) {
      const entry = toEntry(item);
      if (entry) entries.push(entry);
    }

    continuation = data?.continue ?? null;
    if (!continuation || Object.keys(continuation).length === 0) break;
  }

  return entries;
}

/** 只允许从 Wiki 的 /images/ 路径取图，避免这个代理被用来请求任意地址 */
export function isAllowedWikiUrl(url) {
  try {
    const parsed = new URL(String(url));
    return parsed.protocol === "https:" && parsed.host === WIKI_HOST && parsed.pathname.startsWith("/images/");
  } catch {
    return false;
  }
}

export async function fetchWikiImage(url, { fetchImpl = fetch, retries = 2, timeoutMs = 20000 } = {}) {
  if (!isAllowedWikiUrl(url)) throw new Error("不允许的图标地址");

  const response = await fetchWithRetry(url, { fetchImpl, retries, timeoutMs, accept: "image/*" });
  return Buffer.from(await response.arrayBuffer());
}

/**
 * 校验下载到的字节确实是图标。
 * 注意 Wiki 会把 PNG 原图重新编码后提供，所以本地文件体积通常小于 API 上报的 size，
 * 体积比对不能当作完整性依据，这里按文件头判断。
 */
export function looksLikeImage(buffer, mime) {
  if (!buffer || buffer.length === 0) return false;

  if (mime === "image/png") {
    return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  }

  if (mime === "image/svg+xml") {
    const head = buffer.toString("utf8", 0, 1000);
    return head.includes("<svg") || head.includes("<?xml");
  }

  return false;
}
