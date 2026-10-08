#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { parse } from "parse5";
import { analyzeGraph } from "./audit-graph.mjs";

const DEFAULT_BUDGETS = {
  initialJsBrotli: 153600,
  initialJsRaw: 512000,
  initialCssBrotli: 30720,
  initialFontRaw: 102400,
  initialFontCount: 2,
  lcpImageRaw: 256000,
};
const LIMITATIONS = [
  "This is a static build audit, not full performance verification. Browser and HTTP checks have not run.",
  "JS/CSS raw, gzip and Brotli sizes are local per-file compression estimates, not measured production transfer.",
  "The manifest describes potential imports, not observed first-paint requests or a measured waterfall. Dynamic classifications and initialDepth are declarations, not runtime measurements.",
  "potentialDynamicDepth counts dynamic edges on cycle-free module paths; static edges cost zero. Entry/static modules are already loaded at depth zero, and back-edges cannot reload them. hasDynamicCycle describes graph structure, not infinite requests or measured runtime depth.",
  "Initial JS/CSS include the entry static closure, declared initial dynamic static closures, and local HTML scripts/styles/modulepreloads, including manifest-known HTML script static closures. Runtime-injected assets and CSS background images are outside static detection.",
  "HTML, font, image, and script inventories do not establish actual browser requests. Whole-dist font/image inventories use filename extensions. Only declared fonts and local font preloads count toward initial font budgets; unverified declared fonts count but have unknown bytes.",
  "Image srcset parsing supports basic URL/width-or-density-descriptor lists, not the full browser selection algorithm. Data URL lists and unsupported descriptors are reported as unverified. Candidates are not measured LCP.",
  "Remote assets are never fetched. Absolute/protocol-relative script URLs are external candidates; same-origin versus third-party ownership is unknown.",
  "_headers, robots.txt and sitemap.xml checks are existence-only; deployed HTTP headers, caching, indexing and file semantics are not verified.",
];

const emptySize = () => ({ raw: 0, gzip: 0, brotli: 0 });
const posix = (value) => value.split(path.sep).join("/");
const nonblank = (value) => typeof value === "string" && value.trim().length > 0;
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const deployedPath = (url, base) => base === "/" || url === base.slice(0, -1) || url.startsWith(base)
  ? url
  : `${base}${url.slice(1)}`;

function requireValid(condition, message) {
  if (!condition) throw new Error(message);
}

function knownFields(value, fields, label) {
  requireValid(object(value), `${label} must be an object`);
  for (const field of Object.keys(value)) {
    requireValid(fields.includes(field), `${label}: unknown field "${field}"`);
  }
}

function stringList(value, label) {
  requireValid(Array.isArray(value) && value.every(nonblank), `${label} must be an array of nonblank strings`);
  requireValid(new Set(value).size === value.length, `${label} contains duplicate declarations`);
  return value;
}

function relativeFile(value, label) {
  requireValid(nonblank(value), `${label} must be a nonblank relative file path`);
  requireValid(
    !value.includes("\\") && !value.includes("\0") && !/[?#]/.test(value) &&
    !path.posix.isAbsolute(value) && !/^[a-z][a-z\d+.-]*:/i.test(value) &&
    value.split("/").every((part) => part !== ".."),
    `${label} must stay within dist: "${value}"`,
  );
  const normalized = path.posix.normalize(value);
  requireValid(normalized !== "." && !normalized.endsWith("/"), `${label} must identify a file`);
  return normalized;
}

function normalizeUrlPath(value, label, { base = false } = {}) {
  requireValid(nonblank(value) && value.startsWith("/") && !value.startsWith("//"), `${label} must be an absolute URL path, not an origin`);
  requireValid(!/[?#\\\0]/.test(value), `${label} must not contain query, fragment, backslash or NUL`);
  let decoded;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new Error(`${label} has invalid percent encoding`);
  }
  requireValid(!/[?#\\\0]/.test(decoded) && !decoded.startsWith("//"), `${label} contains an invalid encoded path`);
  requireValid(!decoded.split("/").includes(".."), `${label} must not contain parent traversal`);
  let normalized = path.posix.normalize(decoded);
  if (base && !normalized.endsWith("/")) normalized += "/";
  return normalized;
}

function parseCli(argv) {
  const result = { strict: false };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    requireValid(flag !== "--allow-dynamic" && !flag.startsWith("--allow-dynamic="), "--allow-dynamic was removed; migrate to --config routes[].initialDynamicImports or deferredDynamicImports using exact manifest keys, triggers and reasons");
    requireValid(["--profile", "--dist", "--config", "--strict"].includes(flag), `unknown argument "${flag}"`);
    requireValid(!seen.has(flag), `duplicate flag ${flag}`);
    seen.add(flag);
    if (flag === "--strict") result.strict = true;
    else {
      const value = argv[++index];
      requireValid(nonblank(value) && !value.startsWith("--"), `${flag} requires a value`);
      result[flag.slice(2)] = value;
    }
  }
  requireValid(["marketing", "app", "hybrid"].includes(result.profile), "--profile is required and must be marketing, app or hybrid");
  requireValid(result.profile !== "hybrid" || result.config, "--profile hybrid requires --config with explicit route kinds");
  return result;
}

function loadConfig(file, profile) {
  const value = JSON.parse(fs.readFileSync(file, "utf8"));
  knownFields(value, ["base", "budgets", "routes", "ignoredHtml"], "config");
  for (const field of ["base", "budgets", "ignoredHtml"]) {
    requireValid(value[field] !== null, `config.${field} must not be null`);
  }
  const base = normalizeUrlPath(value.base ?? "/", "config.base", { base: true });
  knownFields(value.budgets ?? {}, Object.keys(DEFAULT_BUDGETS), "config.budgets");
  const budgets = { ...DEFAULT_BUDGETS, ...value.budgets };
  for (const [key, budget] of Object.entries(budgets)) {
    requireValid(Number.isSafeInteger(budget) && budget >= 0, `config.budgets.${key} must be a nonnegative safe integer`);
  }
  requireValid(Array.isArray(value.routes) && value.routes.length > 0, "config.routes must be a nonempty array");
  const urls = new Set();
  const routes = value.routes.map((route, index) => {
    const label = `config.routes[${index}]`;
    knownFields(route, ["url", "html", "entry", "kind", "initialDynamicImports", "deferredDynamicImports", "initialFonts", "lcpImage"], label);
    for (const field of ["kind", "initialDynamicImports", "deferredDynamicImports", "initialFonts", "lcpImage"]) {
      requireValid(route[field] !== null, `${label}.${field} must not be null`);
    }
    const url = normalizeUrlPath(route.url, `${label}.url`);
    const deployedUrl = deployedPath(url, base);
    requireValid(!urls.has(deployedUrl), `${label}: duplicate normalized route URL "${deployedUrl}"`);
    urls.add(deployedUrl);
    const html = relativeFile(route.html, `${label}.html`);
    requireValid(/\.html?$/i.test(html), `${label}.html must be an HTML file`);
    requireValid(nonblank(route.entry), `${label}.entry must be an exact manifest key`);
    requireValid(profile !== "hybrid" || route.kind !== undefined, `${label}.kind is required for hybrid`);
    const kind = route.kind ?? (profile === "marketing" ? "public" : "app");
    requireValid(["public", "app"].includes(kind), `${label}.kind must be public or app`);
    const initialDynamicImports = stringList(route.initialDynamicImports ?? [], `${label}.initialDynamicImports`);
    requireValid(Array.isArray(route.deferredDynamicImports ?? []), `${label}.deferredDynamicImports must be an array`);
    const declarations = new Set(initialDynamicImports);
    const deferredDynamicImports = (route.deferredDynamicImports ?? []).map((item, childIndex) => {
      const childLabel = `${label}.deferredDynamicImports[${childIndex}]`;
      knownFields(item, ["key", "trigger", "reason"], childLabel);
      requireValid(nonblank(item.key), `${childLabel}.key must be an exact manifest key`);
      requireValid(["navigation", "interaction", "viewport", "idle"].includes(item.trigger), `${childLabel}.trigger must be navigation, interaction, viewport or idle`);
      requireValid(nonblank(item.reason), `${childLabel}.reason must be nonblank`);
      requireValid(!declarations.has(item.key), `${childLabel}: duplicate or conflicting dynamic declaration "${item.key}"`);
      declarations.add(item.key);
      return item;
    });
    const initialFonts = stringList(route.initialFonts ?? [], `${label}.initialFonts`);
    requireValid(route.lcpImage === undefined || nonblank(route.lcpImage), `${label}.lcpImage must be a nonblank URL`);
    return { url, html, entry: route.entry, kind, initialDynamicImports, deferredDynamicImports, initialFonts, ...(route.lcpImage === undefined ? {} : { lcpImage: route.lcpImage }) };
  });
  requireValid(Array.isArray(value.ignoredHtml ?? []), "config.ignoredHtml must be an array");
  const ignored = new Set();
  const ignoredHtml = (value.ignoredHtml ?? []).map((item, index) => {
    const label = `config.ignoredHtml[${index}]`;
    knownFields(item, ["file", "reason"], label);
    const name = relativeFile(item.file, `${label}.file`);
    requireValid(/\.html?$/i.test(name), `${label}.file must be an HTML file`);
    requireValid(nonblank(item.reason), `${label}.reason must be nonblank`);
    requireValid(!ignored.has(name) && !routes.some((route) => route.html === name), `${label}: duplicate or mapped ignored HTML "${name}"`);
    ignored.add(name);
    return { file: name, reason: item.reason };
  });
  return { base, budgets, routes, ignoredHtml };
}

function htmlDocument(source) {
  const document = parse(source);
  const elements = [];
  const visit = (node) => {
    if (node.tagName) elements.push(node);
    if (node.tagName !== "template") for (const child of node.childNodes ?? []) visit(child);
  };
  visit(document);
  const attr = (node, name) => node.attrs?.find((item) => item.name === name)?.value ?? "";
  const text = (node) => {
    if (["script", "style", "noscript", "template"].includes(node.tagName)) return "";
    if (node.nodeName === "#text") return node.value;
    return (node.childNodes ?? []).map(text).join(" ");
  };
  const cleanText = (node) => text(node).replace(/\s+/g, " ").trim();
  const find = (name) => elements.filter((node) => node.tagName === name);
  const relations = (node) => attr(node, "rel").toLowerCase().split(/\s+/);
  const root = elements.find((node) => attr(node, "id") === "root");
  const body = find("body")[0];
  const jsonLd = find("script").filter((node) => attr(node, "type").trim().toLowerCase() === "application/ld+json").map((node) => {
    try {
      const value = JSON.parse((node.childNodes ?? []).map((child) => child.value ?? "").join(""));
      requireValid(object(value) || (Array.isArray(value) && value.length > 0 && value.every(object)), "JSON-LD must be an object or a nonempty array of objects");
      requireValid(Array.isArray(value) || Object.keys(value).length > 0, "JSON-LD must not be empty");
      return { valid: true };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  });
  const references = [];
  const srcsetObservations = [];
  const reference = (node, attribute, category, extra = {}) => {
    const url = attr(node, attribute).trim();
    if (url) references.push({ url, source: `${node.tagName}[${attribute}]`, category, ...extra });
  };
  const srcset = (node, attribute) => {
    const value = attr(node, attribute).trim();
    if (!value) return;
    if (/data:/i.test(value)) {
      srcsetObservations.push({ source: `${node.tagName}[${attribute}]`, value, status: "unverified", reason: "data URL srcset is not enumerated" });
      return;
    }
    let remaining = value;
    while (remaining) {
      remaining = remaining.replace(/^[\s,]+/, "");
      if (!remaining) break;
      const urlToken = remaining.match(/^\S+/)[0];
      remaining = remaining.slice(urlToken.length);
      let url = urlToken;
      let descriptor = "";
      if (url.endsWith(",")) url = url.replace(/,+$/, "");
      else {
        const comma = remaining.indexOf(",");
        descriptor = (comma < 0 ? remaining : remaining.slice(0, comma)).trim();
        remaining = comma < 0 ? "" : remaining.slice(comma + 1);
      }
      if (descriptor && (!/^(?:\d+w|(?:\d+(?:\.\d+)?|\.\d+)x)$/.test(descriptor) || Number.parseFloat(descriptor) <= 0)) {
        srcsetObservations.push({ source: `${node.tagName}[${attribute}]`, value: `${url} ${descriptor}`, status: "unverified", reason: "unsupported srcset descriptor" });
      }
      references.push({ url, source: `${node.tagName}[${attribute}]`, category: "image", descriptor: descriptor || null });
    }
  };
  for (const node of elements) {
    if (node.tagName === "script") reference(node, "src", "script", { module: attr(node, "type").toLowerCase() === "module" });
    if (node.tagName === "link") {
      const rel = relations(node);
      const as = attr(node, "as").toLowerCase();
      if (rel.includes("stylesheet")) reference(node, "href", "css");
      else if (rel.includes("modulepreload")) reference(node, "href", "script", { module: true, preload: true });
      else if (rel.includes("preload")) {
        reference(node, "href", ["font", "image", "script", "style"].includes(as) ? (as === "style" ? "css" : as) : "preload", { preload: true });
        if (as === "image") srcset(node, "imagesrcset");
      }
    }
    if (node.tagName === "img") {
      reference(node, "src", "image");
      srcset(node, "srcset");
    }
    if (node.tagName === "source") {
      reference(node, "src", "media");
      srcset(node, "srcset");
    }
    if (["video", "audio"].includes(node.tagName)) reference(node, "src", "media");
    if (node.tagName === "video") reference(node, "poster", "image");
  }
  return {
    metadata: {
      title: find("title").map(cleanText).find(Boolean) ?? "",
      hasStaticH1: find("h1").some((node) => cleanText(node).length > 0),
      rootHasText: Boolean(root && cleanText(root)),
      rootTextLength: root ? cleanText(root).length : 0,
      bodyTextLength: body ? cleanText(body).length : 0,
      description: find("meta").filter((node) => attr(node, "name").toLowerCase() === "description").map((node) => attr(node, "content").trim()).find(Boolean) ?? "",
      canonical: find("link").filter((node) => relations(node).includes("canonical")).map((node) => attr(node, "href").trim()).find(Boolean) ?? "",
      jsonLd,
      hasValidJsonLd: jsonLd.length > 0 && jsonLd.every((item) => item.valid),
    },
    references,
    srcsetObservations,
    baseHref: find("base").map((node) => attr(node, "href").trim()).find(Boolean) ?? null,
  };
}

function audit(options) {
  const cwd = process.cwd();
  const dist = path.resolve(cwd, options.dist ?? "dist");
  const report = {
    schemaVersion: 2,
    profile: options.profile,
    dist: posix(path.relative(cwd, dist)) || ".",
    config: options.config ? posix(path.relative(cwd, path.resolve(cwd, options.config))) : null,
    base: "/",
    budgets: DEFAULT_BUDGETS,
    manifest: null,
    errors: [],
    warnings: [],
    entries: [],
    routes: [],
    assets: { html: [], fonts: [], images: [], metadataFiles: {} },
    verification: { build: "passed", browser: "not-run", http: "not-run" },
    limitations: LIMITATIONS,
  };
  const issue = (list, code, message, context = {}) => {
    const item = { code, message, ...context };
    if (!list.some((existing) => JSON.stringify(existing) === JSON.stringify(item))) list.push(item);
  };
  const error = (code, message, context) => issue(report.errors, code, message, context);
  const warn = (code, message, context) => issue(report.warnings, code, message, context);
  const finish = () => {
    report.verification.build = report.errors.length ? "failed" : report.warnings.length ? "warning" : "passed";
    return report;
  };
  let config;
  try {
    config = options.config
      ? loadConfig(path.resolve(cwd, options.config), options.profile)
      : { base: "/", budgets: DEFAULT_BUDGETS, routes: null, ignoredHtml: [] };
    report.base = config.base;
    report.budgets = config.budgets;
  } catch (cause) {
    error("INVALID_CONFIG", `Invalid config: ${cause.message}`);
    return finish();
  }
  if (!fs.existsSync(dist) || !fs.statSync(dist).isDirectory()) {
    error("MISSING_DIST", `Build directory does not exist or is not a directory: ${dist}`);
    return finish();
  }
  const realDist = fs.realpathSync(dist);
  const within = (root, file) => {
    const relative = path.relative(root, file);
    return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
  };
  const checkedFile = (file, context = {}) => {
    try {
      const name = relativeFile(file, "asset path");
      const absolute = path.resolve(dist, name);
      requireValid(within(dist, absolute), `asset path escapes dist: ${file}`);
      requireValid(fs.existsSync(absolute), `referenced file is missing: ${name}`);
      requireValid(within(realDist, fs.realpathSync(absolute)), `asset symlink escapes dist: ${file}`);
      requireValid(fs.statSync(absolute).isFile(), `referenced path is not a file: ${name}`);
      return { name, absolute };
    } catch (cause) {
      error("INVALID_OR_MISSING_FILE", cause.message, { file, ...context });
      return null;
    }
  };
  const measured = new Map();
  const measure = (file, context) => {
    const checked = checkedFile(file, context);
    if (!checked) return null;
    if (!measured.has(checked.name)) {
      const bytes = fs.readFileSync(checked.absolute);
      measured.set(checked.name, { raw: bytes.length, gzip: gzipSync(bytes).length, brotli: brotliCompressSync(bytes).length });
    }
    return measured.get(checked.name);
  };
  const inventory = [];
  const walk = (directory, ancestors = new Set()) => {
    const real = fs.realpathSync(directory);
    if (!within(realDist, real)) {
      error("INVALID_ASSET_PATH", `Inventory symlink escapes dist: ${posix(path.relative(dist, directory))}`);
      return;
    }
    if (ancestors.has(real)) {
      error("INVALID_ASSET_PATH", `Inventory directory cycle: ${posix(path.relative(dist, directory))}`);
      return;
    }
    const next = new Set(ancestors).add(real);
    for (const item of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(directory, item.name);
      if (!fs.existsSync(absolute)) {
        error("INVALID_ASSET_PATH", `Inventory contains a broken symlink: ${posix(path.relative(dist, absolute))}`);
      } else if (fs.statSync(absolute).isDirectory()) walk(absolute, next);
      else inventory.push(posix(path.relative(dist, absolute)));
    }
  };
  walk(dist);
  const htmlFiles = inventory.filter((file) => /\.html?$/i.test(file));
  const ignoredHtml = new Map(config.ignoredHtml.map((item) => [item.file, item.reason]));
  for (const item of config.ignoredHtml) checkedFile(item.file, { source: "ignoredHtml" });
  const documents = new Map();
  for (const file of htmlFiles) {
    const checked = checkedFile(file);
    if (checked) documents.set(file, htmlDocument(fs.readFileSync(checked.absolute, "utf8")));
    report.assets.html.push({
      file,
      size: measure(file),
      status: ignoredHtml.has(file) ? "ignored" : "unmapped",
      routes: [],
      ...(ignoredHtml.has(file) ? { reason: ignoredHtml.get(file) } : {}),
    });
  }
  for (const [key, pattern] of [["fonts", /\.(woff2?|ttf|otf|ttc|otc|eot)$/i], ["images", /\.(avif|webp|png|jpe?g|gif|svg|ico)$/i]]) {
    report.assets[key] = inventory.filter((file) => pattern.test(file)).map((file) => ({ file, size: measure(file) }));
  }
  report.assets.metadataFiles = Object.fromEntries(["_headers", "robots.txt", "sitemap.xml"].map((file) => [file, { exists: inventory.includes(file), verification: "existence-only" }]));
  const manifestName = [".vite/manifest.json", "manifest.json"].find((name) => inventory.includes(name));
  if (!manifestName) {
    error("MISSING_MANIFEST", "Vite manifest not found; enable build.manifest and run the production build");
    return finish();
  }
  const manifestPath = checkedFile(manifestName);
  if (!manifestPath) return finish();
  report.manifest = posix(path.relative(cwd, manifestPath.absolute));
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath.absolute, "utf8"));
    requireValid(object(manifest), "manifest must be an object");
    for (const [key, item] of Object.entries(manifest)) {
      requireValid(object(item) && nonblank(item.file), `manifest record "${key}" requires a file`);
      relativeFile(item.file, `manifest["${key}"].file`);
      for (const field of ["imports", "dynamicImports", "css", "assets"]) {
        if (item[field] !== undefined) stringList(item[field], `manifest["${key}"].${field}`);
      }
      for (const file of [...(item.css ?? []), ...(item.assets ?? [])]) {
        relativeFile(file, `manifest["${key}"] asset`);
      }
      requireValid(item.isEntry === undefined || typeof item.isEntry === "boolean", `manifest["${key}"].isEntry must be boolean`);
    }
  } catch (cause) {
    error("INVALID_MANIFEST", `Invalid manifest: ${cause.message}`);
    return finish();
  }
  const entryKeys = Object.keys(manifest).filter((key) => manifest[key].isEntry);
  const keysByFile = new Map();
  for (const [key, item] of Object.entries(manifest)) {
    const file = relativeFile(item.file, "manifest file");
    if (!keysByFile.has(file)) keysByFile.set(file, []);
    keysByFile.get(file).push(key);
  }
  if (!entryKeys.length) error("MISSING_ENTRY_RECORD", "manifest has no isEntry record");
  const graphCache = new Map();
  const graphFor = (entry) => {
    const cacheKey = JSON.stringify(entry);
    if (!graphCache.has(cacheKey)) {
      const graph = analyzeGraph(manifest, entry);
      for (const missing of graph.missing) error("MISSING_MANIFEST_RECORD", `Missing manifest record "${missing.key}" referenced by "${missing.from ?? "(route entry)"}"`, { entry, ...missing });
      for (const key of graph.reachableKeys) {
        const item = manifest[key];
        for (const file of [item.file, ...(item.css ?? []), ...(item.assets ?? [])]) measure(file, { entry, key });
      }
      graphCache.set(cacheKey, graph);
    }
    return graphCache.get(cacheKey);
  };
  const staticClosure = (roots) => {
    const keys = new Set();
    const queue = [...roots];
    for (let index = 0; index < queue.length; index += 1) {
      const key = queue[index];
      if (keys.has(key) || !Object.hasOwn(manifest, key)) continue;
      keys.add(key);
      queue.push(...(manifest[key].imports ?? []));
    }
    return [...keys].sort();
  };
  const filesFor = (keys) => {
    const js = new Set();
    const css = new Set();
    for (const key of keys) {
      const item = manifest[key];
      if (/\.css$/i.test(item.file)) css.add(relativeFile(item.file, "manifest file"));
      else js.add(relativeFile(item.file, "manifest file"));
      for (const file of item.css ?? []) css.add(relativeFile(file, "manifest CSS"));
    }
    return { js, css };
  };
  const sum = (files, context) => {
    const sizes = emptySize();
    const details = [...files].sort().map((file) => {
      const size = measure(file, context);
      if (size) for (const unit of Object.keys(sizes)) sizes[unit] += size[unit];
      return { file, size };
    });
    return { ...sizes, files: details };
  };
  for (const key of entryKeys.sort()) {
    const graph = graphFor(key);
    const keys = staticClosure([key]);
    const files = filesFor(keys);
    report.entries.push({
      key,
      file: manifest[key].file,
      size: measure(manifest[key].file, { entry: key }),
      reachableKeys: graph.reachableKeys,
      staticImports: keys.filter((item) => item !== key),
      staticJs: sum(files.js, { entry: key }),
      staticCss: sum(files.css, { entry: key }),
      potentialDynamicDepth: graph.potentialDynamicDepth,
      hasDynamicCycle: graph.hasDynamicCycle,
      potentialDynamicImports: graph.potentialDynamicImports,
    });
  }
  const resolveAsset = (url, route, baseHref = null) => {
    const result = { url, file: null, status: "unverified", size: null };
    const value = url.trim();
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) {
      return { ...result, reason: /^(?:https?:|\/\/)/i.test(value) ? "external URL; origin and size unknown" : "non-file URL; local size unavailable" };
    }
    if (!value || value.startsWith("#")) return { ...result, reason: "no resolvable asset path" };
    try {
      requireValid(!/[\\\0]/.test(value), `invalid asset URL "${url}"`);
      const withoutSuffix = value.split(/[?#]/, 1)[0];
      const decoded = decodeURIComponent(withoutSuffix);
      requireValid(!/[\\\0]/.test(decoded), `invalid encoded asset path "${url}"`);
      const routePath = deployedPath(route.url, config.base);
      const basePath = baseHref
        ? new URL(baseHref, `https://audit.invalid${encodeURI(routePath)}`)
        : new URL(`https://audit.invalid${encodeURI(routePath)}`);
      if (basePath.origin !== "https://audit.invalid") return { ...result, reason: "HTML base points to an external origin" };
      // Check traversal before URL normalisation can discard leading ".." segments.
      const directory = decoded.startsWith("/") ? [] : decodeURIComponent(basePath.pathname).split("/").slice(0, -1).filter(Boolean);
      for (const segment of decoded.split("/")) {
        if (segment === "..") {
          requireValid(directory.length > 0, `asset URL escapes dist: "${url}"`);
          directory.pop();
        } else if (segment && segment !== ".") directory.push(segment);
      }
      const absolutePath = `/${directory.join("/")}`;
      if (config.base !== "/" && !absolutePath.startsWith(config.base)) return { ...result, reason: `URL is outside configured base "${config.base}"` };
      const name = absolutePath.slice(config.base.length);
      if (!name) return { ...result, reason: "URL resolves to the base directory, not a file" };
      const file = relativeFile(name, "resolved asset");
      const size = measure(file, { route: route.url, source: url });
      return { ...result, file, status: size ? "local" : "missing", size };
    } catch (cause) {
      error("INVALID_ASSET_URL", cause.message, { route: route.url, source: url });
      return { ...result, status: "invalid", reason: cause.message };
    }
  };
  const htmlUrl = (file) => {
    const suffix = file.replace(/(^|\/)index\.html?$/i, "$1");
    return `${config.base}${suffix}`;
  };
  let routes = config.routes;
  if (!routes) {
    routes = [];
    for (const file of htmlFiles) {
      const route = { url: htmlUrl(file), html: file, kind: options.profile === "marketing" ? "public" : "app", initialDynamicImports: [], deferredDynamicImports: [], initialFonts: [] };
      const doc = documents.get(file);
      const direct = entryKeys.filter((key) => key === file);
      const candidates = new Set(direct);
      if (doc) {
        const scripts = doc.references.filter((item) => item.category === "script" && !item.preload).map((item) => resolveAsset(item.url, route, doc.baseHref).file).filter(Boolean);
        for (const key of entryKeys) {
          if (scripts.includes(relativeFile(manifest[key].file, "manifest entry"))) candidates.add(key);
        }
      }
      if (candidates.size !== 1) {
        error("AMBIGUOUS_HTML_ENTRY", `Cannot uniquely resolve entry for "${file}" (${candidates.size} matches); provide --config with explicit route -> entry mapping`, { file, candidates: [...candidates] });
        routes.push({ ...route, entry: null });
      } else routes.push({ ...route, entry: [...candidates][0] });
    }
  }
  if (!htmlFiles.length) error("MISSING_HTML", "No built HTML files found in dist");
  const budget = (route, name, actual) => {
    if (actual > config.budgets[name]) warn("BUDGET_EXCEEDED", `${name}: ${actual} > ${config.budgets[name]}`, { route, budget: name, actual, limit: config.budgets[name] });
  };
  for (const route of routes) {
    const context = { route: route.url };
    const htmlItem = report.assets.html.find((item) => item.file === route.html);
    if (htmlItem) {
      htmlItem.status = "mapped";
      htmlItem.routes.push(route.url);
    }
    let doc = documents.get(route.html);
    if (!doc) {
      const checked = checkedFile(route.html, context);
      if (checked) doc = htmlDocument(fs.readFileSync(checked.absolute, "utf8"));
    }
    const result = {
      url: route.url, html: route.html, entry: route.entry, kind: route.kind,
      metadata: doc?.metadata ?? null,
      staticImports: [], htmlScriptManifestKeys: [], reachableKeys: [], potentialDynamicDepth: 0,
      hasDynamicCycle: false, potentialDynamicImports: [],
      initialDepth: 0, initialDepthBasis: "maximum potential graph depth of declared initial dynamic modules; not measured",
      initialJs: { ...emptySize(), files: [] }, initialCss: { ...emptySize(), files: [] },
      initialFonts: { count: 0, localCount: 0, raw: 0, files: [], unverified: [] },
      lcpImage: { status: "not-declared", url: null, file: null, size: null },
      assetReferences: [], imageCandidates: [], externalScriptCandidates: [],
      srcsetObservations: doc?.srcsetObservations ?? [],
    };
    report.routes.push(result);
    if (doc && route.kind === "public") {
      const checks = [
        ["hasStaticH1", "a nonempty static H1"], ["rootHasText", "static text inside #root"],
        ["title", "a nonempty title"], ["description", "a meta description"],
        ["canonical", "a canonical link"], ["hasValidJsonLd", "valid nonempty JSON-LD content"],
      ];
      for (const [field, description] of checks) if (!doc.metadata[field]) warn("PUBLIC_HTML_MISSING_CONTENT", `Public HTML is missing ${description}`, { ...context, file: route.html, field });
    }
    const references = (doc?.references ?? []).map((reference) => ({
      ...reference, ...resolveAsset(reference.url, route, doc.baseHref),
    }));
    const htmlScriptManifestKeys = [...new Set(references
      .filter((item) => item.category === "script" && item.status === "local")
      .flatMap((item) => keysByFile.get(item.file) ?? []))].sort();
    result.htmlScriptManifestKeys = htmlScriptManifestKeys;
    const initialRoots = [...new Set([route.entry, ...htmlScriptManifestKeys].filter((key) => key !== null))];
    const graph = initialRoots.length ? graphFor(initialRoots) : null;
    if (route.entry !== null) {
      if (Object.hasOwn(manifest, route.entry) && !manifest[route.entry].isEntry) error("INVALID_ROUTE_ENTRY", `Route entry "${route.entry}" is not an isEntry manifest record`, context);
    }
    const keys = staticClosure([...initialRoots, ...route.initialDynamicImports]);
    const files = filesFor(keys);
    if (graph) {
      const dynamicKeys = new Set(graph.potentialDynamicImports.map((item) => item.key));
      const deferred = new Map(route.deferredDynamicImports.map((item) => [item.key, item]));
      for (const key of [...route.initialDynamicImports, ...deferred.keys()]) {
        if (!dynamicKeys.has(key)) error("INVALID_DYNAMIC_DECLARATION", `Dynamic declaration "${key}" is not an exact reachable dynamic manifest key for entry "${route.entry}"`, context);
      }
      const entryStatic = staticClosure(route.entry === null ? [] : [route.entry]);
      for (const key of deferred.keys()) {
        if (keys.includes(key)) error("CONFLICTING_DYNAMIC_DECLARATION", `Deferred module "${key}" is also included in an initial static closure`, context);
      }
      result.reachableKeys = graph.reachableKeys;
      result.staticImports = entryStatic.filter((key) => key !== route.entry);
      result.potentialDynamicDepth = graph.potentialDynamicDepth;
      result.hasDynamicCycle = graph.hasDynamicCycle;
      result.potentialDynamicImports = graph.potentialDynamicImports.map((item) => ({
        ...item,
        classification: route.initialDynamicImports.includes(item.key) ? "initial" : deferred.has(item.key) ? "deferred" : "unclassified",
        ...(deferred.has(item.key) ? { trigger: deferred.get(item.key).trigger, reason: deferred.get(item.key).reason } : {}),
      }));
      for (const item of result.potentialDynamicImports) {
        if (item.classification === "unclassified") warn("UNCLASSIFIED_DYNAMIC_IMPORT", `Reachable dynamic import "${item.key}" needs an exact initial or deferred declaration`, { ...context, key: item.key });
        if (item.classification === "initial") warn("INITIAL_DYNAMIC_IMPORT", `Declared initial dynamic dependency "${item.key}"; desired initial dynamic dependency count is zero`, { ...context, key: item.key });
      }
      result.initialDepth = result.potentialDynamicImports
        .filter((item) => item.classification === "initial")
        .reduce((depth, item) => Math.max(depth, item.potentialDynamicDepth ?? 0), 0);
    }
    const fontFiles = new Map();
    const addFont = (asset, source) => {
      if (asset.status === "local") {
        if (!fontFiles.has(asset.file)) fontFiles.set(asset.file, { file: asset.file, size: asset.size, sources: [] });
        const sources = fontFiles.get(asset.file).sources;
        if (!sources.includes(source)) sources.push(source);
      } else result.initialFonts.unverified.push({ ...asset, source });
    };
    if (doc) {
      for (const observation of references) {
        const asset = observation;
        const reference = observation;
        result.assetReferences.push(observation);
        if (asset.status === "unverified") warn("UNVERIFIED_ASSET", `Cannot verify ${reference.category} asset "${reference.url}": ${asset.reason}`, context);
        if (reference.category === "image") result.imageCandidates.push(observation);
        if (reference.category === "script" && asset.status === "unverified") result.externalScriptCandidates.push(observation);
        if (asset.status === "local") {
          if (reference.category === "script") files.js.add(asset.file);
          if (reference.category === "css") files.css.add(asset.file);
        }
        if (reference.category === "font" && reference.preload) addFont(asset, reference.source);
      }
      for (const observation of doc.srcsetObservations) warn("UNVERIFIED_SRCSET", observation.reason, { ...context, source: observation.source });
    }
    for (const url of route.initialFonts) {
      let asset;
      if (/^(?:[a-z][a-z\d+.-]*:|\/)/i.test(url)) {
        asset = resolveAsset(url, route, doc?.baseHref);
      } else {
        const file = relativeFile(url, "config.initialFonts");
        const size = measure(file, { ...context, source: "config.initialFonts" });
        asset = { url, file, size, status: size ? "local" : "missing" };
      }
      addFont(asset, "config.initialFonts");
      if (asset.status === "unverified") warn("UNVERIFIED_INITIAL_FONT", `Initial font "${url}" is unverified: ${asset.reason}`, context);
    }
    result.initialJs = sum(files.js, context);
    result.initialCss = sum(files.css, context);
    result.initialFonts.files = [...fontFiles.values()].sort((a, b) => a.file.localeCompare(b.file));
    result.initialFonts.localCount = fontFiles.size;
    const declaredUnverifiedFonts = new Set(result.initialFonts.unverified
      .filter((item) => item.source === "config.initialFonts")
      .map((item) => item.url.split("#", 1)[0]));
    result.initialFonts.count = fontFiles.size + declaredUnverifiedFonts.size;
    result.initialFonts.raw = result.initialFonts.files.reduce((total, item) => total + item.size.raw, 0);
    budget(route.url, "initialJsBrotli", result.initialJs.brotli);
    budget(route.url, "initialJsRaw", result.initialJs.raw);
    budget(route.url, "initialCssBrotli", result.initialCss.brotli);
    budget(route.url, "initialFontRaw", result.initialFonts.raw);
    budget(route.url, "initialFontCount", result.initialFonts.count);
    if (route.lcpImage) {
      result.lcpImage = resolveAsset(route.lcpImage, route, doc?.baseHref);
      if (result.lcpImage.status === "local") budget(route.url, "lcpImageRaw", result.lcpImage.size.raw);
      else warn("UNVERIFIED_LCP_IMAGE", `Declared LCP image "${route.lcpImage}" is unverified`, context);
    }
  }
  for (const item of report.assets.html) {
    if (item.status === "unmapped" && config.routes) warn("UNMAPPED_HTML", `Discovered HTML "${item.file}" is not mapped to a route or explicitly ignored`, { file: item.file });
  }
  return finish();
}

try {
  const options = parseCli(process.argv.slice(2));
  const report = audit(options);
  console.log(JSON.stringify(report, null, 2));
  for (const error of report.errors) console.error(`audit error [${error.code}]: ${error.message}`);
  process.exitCode = report.errors.length ? 2 : options.strict && report.warnings.length ? 1 : 0;
} catch (error) {
  console.error(`audit error: ${error.message}`);
  process.exitCode = 2;
}
