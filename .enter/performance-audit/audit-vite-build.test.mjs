import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { analyzeGraph } from "./audit-graph.mjs";

const scripts = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(scripts, "audit-vite-build.mjs");
const fixtures = path.join(scripts, `.audit-test-fixtures-${process.pid}`);
fs.mkdirSync(fixtures);
after(() => fs.rmSync(fixtures, { recursive: true, force: true }));
let counter = 0;

const publicHtml = (extra = "", script = "/assets/main.js") => `<!doctype html>
<html><head><title> A complete page </title>
<meta content="A useful description" name="description">
<link href="https://example.test/" rel="alternate canonical">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage"}</script>
${extra}</head><body><div class="container" id="root"><div><div></div><h1>Nested heading</h1></div><p>Rendered copy.</p></div>
<script src="${script}" type="module"></script></body></html>`;
const appHtml = (extra = "", script = "/assets/main.js") => `<!doctype html><html><head>${extra}</head><body><div id="root"></div><script type="module" src="${script}"></script></body></html>`;
const entry = (extra = {}) => ({ file: "assets/main.js", isEntry: true, ...extra });
const route = (extra = {}) => ({ url: "/", html: "index.html", entry: "index.html", ...extra });
const deferred = (key, extra = {}) => ({ key, trigger: "navigation", reason: "Loaded on a later navigation", ...extra });

function fixture({ manifest = { "index.html": entry() }, html = publicHtml(), files = {}, config } = {}) {
  const cwd = path.join(fixtures, String(++counter));
  fs.mkdirSync(cwd, { recursive: true });
  const write = (relative, value) => {
    const file = path.join(cwd, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof value === "object" && !Buffer.isBuffer(value) ? JSON.stringify(value) : value);
  };
  write("dist/.vite/manifest.json", manifest);
  if (html !== null) write("dist/index.html", html);
  write("dist/assets/main.js", "console.log('entry');");
  for (const name of ["_headers", "robots.txt", "sitemap.xml"]) write(`dist/${name}`, "");
  for (const [name, content] of Object.entries(files)) write(`dist/${name}`, content);
  if (config !== undefined) write("audit.json", config);
  const run = (args = ["--profile", "marketing", "--strict"], options = {}) => {
    const output = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8", timeout: 15000, ...options });
    assert.ifError(output.error);
    assert.equal(output.signal, null, output.stderr);
    let report = null;
    if (output.stdout.trim()) {
      report = JSON.parse(output.stdout);
      assert.equal(report.schemaVersion, 2);
      assert.equal(report.verification.browser, "not-run");
      assert.equal(report.verification.http, "not-run");
      assert.equal(report.verification.build, report.errors.length ? "failed" : report.warnings.length ? "warning" : "passed");
    }
    return { ...output, report };
  };
  return { cwd, write, run };
}

function hasIssue(result, code, field) {
  return [...result.report.errors, ...result.report.warnings].some((item) => item.code === code && (!field || item.budget === field || item.field === field));
}

function noisyBytes(size) {
  const bytes = Buffer.alloc(size);
  let state = 123456789;
  for (let index = 0; index < size; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    bytes[index] = 32 + ((state >>> 0) % 95);
  }
  return bytes;
}

test("strict public baseline passes, reversed attributes and nested root text are parsed", () => {
  const result = fixture().run();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.report.warnings, []);
  assert.equal(result.report.routes[0].metadata.hasStaticH1, true);
  assert.equal(result.report.routes[0].metadata.rootHasText, true);
  assert.ok(result.report.routes[0].metadata.rootTextLength > 10);
  assert.ok(result.report.routes[0].metadata.description);
  assert.ok(result.report.routes[0].metadata.canonical);
  assert.equal(result.report.routes[0].metadata.hasValidJsonLd, true);
  const source = Buffer.from("console.log('entry');");
  assert.deepEqual(
    { ...result.report.routes[0].initialJs, files: undefined },
    { raw: source.length, gzip: gzipSync(source).length, brotli: brotliCompressSync(source).length, files: undefined },
  );
  assert.equal(result.report.assets.html[0].status, "mapped");
  assert.equal(result.report.assets.metadataFiles._headers.verification, "existence-only");
  assert.ok(result.report.limitations.some((line) => line.includes("not measured production transfer")));
});

test("actual declared initial dynamic 600 KiB is budgeted for app, including its static CSS", () => {
  const large = noisyBytes(600 * 1024);
  const result = fixture({
    html: appHtml(),
    manifest: {
      "index.html": entry({ dynamicImports: ["src/Startup.tsx"] }),
      "src/Startup.tsx": { file: "assets/start.js", imports: ["shared"], css: ["assets/start.css"] },
      shared: { file: "assets/shared.js" },
    },
    files: { "assets/start.js": large, "assets/shared.js": "shared", "assets/start.css": "body{color:red}" },
    config: { routes: [route({ initialDynamicImports: ["src/Startup.tsx"] })] },
  }).run(["--profile", "app", "--config", "audit.json", "--strict"]);
  assert.equal(result.status, 1);
  assert.equal(result.report.routes[0].initialJs.raw, large.length + 6 + 21);
  assert.equal(result.report.routes[0].initialCss.raw, 15);
  assert.equal(result.report.routes[0].initialDepth, 1);
  assert.ok(hasIssue(result, "INITIAL_DYNAMIC_IMPORT"));
  assert.ok(hasIssue(result, "BUDGET_EXCEEDED", "initialJsRaw"));
  assert.ok(hasIssue(result, "BUDGET_EXCEEDED", "initialJsBrotli"));
});

test("unknown app dynamic import cannot silently strict-pass; default remains report-only", () => {
  const f = fixture({
    html: appHtml(),
    manifest: { "index.html": entry({ dynamicImports: ["heavy"] }), heavy: { file: "assets/heavy.js" } },
    files: { "assets/heavy.js": "x".repeat(600 * 1024) },
  });
  const strict = f.run(["--profile", "app", "--strict"]);
  assert.equal(strict.status, 1);
  assert.ok(hasIssue(strict, "UNCLASSIFIED_DYNAMIC_IMPORT"));
  assert.equal(strict.report.routes[0].potentialDynamicImports[0].classification, "unclassified");
  assert.equal(f.run(["--profile", "app"]).status, 0);
});

test("exact deferred declaration with reason passes for all profiles; no blanket descendant exemption", () => {
  for (const profile of ["marketing", "app", "hybrid"]) {
    const f = fixture({
      manifest: { "index.html": entry({ dynamicImports: ["about"] }), about: { file: "assets/about.js" } },
      files: { "assets/about.js": "about" },
      config: { routes: [route({ kind: "public", deferredDynamicImports: [deferred("about")] })] },
    });
    const result = f.run(["--profile", profile, "--config", "audit.json", "--strict"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.report.routes[0].potentialDynamicImports[0].classification, "deferred");
  }
  const result = fixture({
    manifest: {
      "index.html": entry({ dynamicImports: ["about"] }),
      about: { file: "assets/about.js", dynamicImports: ["dialog"] },
      dialog: { file: "assets/dialog.js" },
    },
    files: { "assets/about.js": "about", "assets/dialog.js": "dialog" },
    config: { routes: [route({ deferredDynamicImports: [deferred("about")] })] },
  }).run(["--profile", "app", "--config", "audit.json", "--strict"]);
  assert.equal(result.status, 1);
  assert.ok(result.report.warnings.some((item) => item.code === "UNCLASSIFIED_DYNAMIC_IMPORT" && item.key === "dialog"));
});

test("dynamic -> static -> dynamic traversal finds depth two and longest potential path", () => {
  const manifest = {
    "index.html": entry({ dynamicImports: ["first", "last"] }),
    first: { file: "assets/first.js", imports: ["bridge"] },
    bridge: { file: "assets/bridge.js", dynamicImports: ["last"] },
    last: { file: "assets/last.js" },
  };
  const result = fixture({
    manifest,
    files: { "assets/first.js": "first", "assets/bridge.js": "bridge", "assets/last.js": "last" },
    config: { routes: [route({ deferredDynamicImports: [deferred("first"), deferred("last")] })] },
  }).run(["--profile", "app", "--config", "audit.json", "--strict"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.report.entries[0].potentialDynamicDepth, 2);
  assert.equal(result.report.routes[0].potentialDynamicDepth, 2);
  assert.equal(result.report.routes[0].potentialDynamicImports.find((item) => item.key === "last").potentialDynamicDepth, 2);
  assert.deepEqual(result.report.routes[0].potentialDynamicImports.find((item) => item.key === "last").importedBy, ["bridge", "index.html"]);
});

test("shared static JS and CSS are deduplicated across initial closures and raw HTML links", () => {
  const result = fixture({
    html: publicHtml('<link href="/assets/shared.css" rel="stylesheet"><link rel="modulepreload" href="/assets/shared.js">'),
    manifest: {
      "index.html": entry({ imports: ["shared"], dynamicImports: ["one", "two"], css: ["assets/shared.css"] }),
      shared: { file: "assets/shared.js", css: ["assets/shared.css"] },
      one: { file: "assets/one.js", imports: ["shared", "alias"] },
      two: { file: "assets/two.js", imports: ["shared"], css: ["assets/shared.css"] },
      alias: { file: "./assets/shared.js" },
    },
    files: { "assets/shared.js": "shared", "assets/one.js": "one", "assets/two.js": "two", "assets/shared.css": "css" },
    config: { routes: [route({ initialDynamicImports: ["one", "two"] })] },
  }).run(["--profile", "app", "--config", "audit.json"]);
  assert.equal(result.status, 0);
  assert.equal(result.report.routes[0].initialJs.raw, 21 + 6 + 3 + 3);
  assert.equal(result.report.routes[0].initialJs.files.length, 4);
  assert.equal(result.report.routes[0].initialCss.raw, 3);
  assert.equal(result.report.routes[0].initialCss.files.length, 1);
});

test("static and dynamic cycles terminate without repeated module loads or infinite depth", () => {
  const staticGraph = analyzeGraph({
    root: { imports: ["shared"] }, shared: { imports: ["root"], dynamicImports: ["page"] }, page: {},
  }, "root");
  assert.equal(staticGraph.potentialDynamicDepth, 1);
  assert.equal(staticGraph.hasDynamicCycle, false);
  const dynamicGraph = analyzeGraph({
    root: { dynamicImports: ["page"] }, page: { imports: ["bridge"] }, bridge: { dynamicImports: ["page", "last"] }, last: {},
  }, "root");
  assert.equal(dynamicGraph.potentialDynamicDepth, 2);
  assert.equal(dynamicGraph.hasDynamicCycle, true);
  assert.equal(dynamicGraph.potentialDynamicImports.find((item) => item.key === "page").potentialDynamicDepth, 1);
  assert.equal(dynamicGraph.potentialDynamicImports.find((item) => item.key === "last").potentialDynamicDepth, 2);
  const result = fixture({
    manifest: { "index.html": entry({ dynamicImports: ["page"] }), page: { file: "assets/page.js", dynamicImports: ["page"] } },
    files: { "assets/page.js": "page" },
    config: { routes: [route({ deferredDynamicImports: [deferred("page")] })] },
  }).run(["--profile", "app", "--config", "audit.json", "--strict"]);
  assert.equal(result.status, 0);
  assert.equal(result.report.routes[0].hasDynamicCycle, true);
  assert.equal(result.report.routes[0].potentialDynamicDepth, 1);
});

test("Vite dynamic -> static entry back-edge keeps details at one and chart at two", () => {
  const result = fixture({
    manifest: {
      "index.html": entry({ dynamicImports: ["src/details.js"] }),
      "src/details.js": { file: "assets/details.js", imports: ["index.html", "_shared.js"], dynamicImports: ["src/chart.js"] },
      "_shared.js": { file: "assets/shared.js", css: ["assets/shared.css"] },
      "src/chart.js": { file: "assets/chart.js" },
      "about/index.html": { file: "assets/about.js", isEntry: true },
    },
    files: {
      "assets/details.js": "details", "assets/shared.js": "shared", "assets/shared.css": "css",
      "assets/chart.js": "chart", "assets/about.js": "about",
      "about/index.html": publicHtml("", "/assets/about.js"),
    },
    config: {
      routes: [
        route({ deferredDynamicImports: [deferred("src/details.js"), deferred("src/chart.js")] }),
        route({ url: "/about/", html: "about/index.html", entry: "about/index.html" }),
      ],
    },
  }).run(["--profile", "marketing", "--config", "audit.json", "--strict"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.report.routes[0].potentialDynamicDepth, 2);
  assert.equal(result.report.routes[0].hasDynamicCycle, true);
  assert.equal(result.report.routes[0].potentialDynamicImports.find((item) => item.key === "src/details.js").potentialDynamicDepth, 1);
  assert.equal(result.report.routes[0].potentialDynamicImports.find((item) => item.key === "src/chart.js").potentialDynamicDepth, 2);
  assert.equal(result.report.routes[1].potentialDynamicDepth, 0);
});

test("back-edges into entry static dependencies never inflate their zero-depth imports", () => {
  const graph = analyzeGraph({
    root: { imports: ["shared"], dynamicImports: ["details"] },
    shared: { dynamicImports: ["separate"] },
    details: { imports: ["shared"], dynamicImports: ["chart"] },
    chart: {},
    separate: {},
  }, "root");
  assert.equal(graph.potentialDynamicDepth, 2);
  assert.equal(graph.potentialDynamicImports.find((item) => item.key === "separate").potentialDynamicDepth, 1);
});

test("dynamic-only cycle has a finite longest nonrepeating path", () => {
  const graph = analyzeGraph({
    root: { dynamicImports: ["a"] },
    a: { dynamicImports: ["b", "c"] },
    b: { dynamicImports: ["c"] },
    c: { dynamicImports: ["a", "last"] },
    last: {},
  }, "root");
  assert.equal(graph.hasDynamicCycle, true);
  assert.equal(graph.potentialDynamicDepth, 4);
  assert.equal(graph.potentialDynamicImports.find((item) => item.key === "a").potentialDynamicDepth, 1);
  assert.equal(graph.potentialDynamicImports.find((item) => item.key === "c").potentialDynamicDepth, 3);
});

test("graph scales through deep chains without stack overflow", () => {
  const manifest = Object.fromEntries(Array.from({ length: 12000 }, (_, index) => [`key${index}`, { imports: index < 11999 ? [`key${index + 1}`] : [] }]));
  const graph = analyzeGraph(manifest, "key0");
  assert.equal(graph.reachableKeys.length, 12000);
  assert.equal(graph.potentialDynamicDepth, 0);
});

test("comments, script, style, noscript, template and empty h1 do not count as public content", () => {
  const f = fixture({
    html: publicHtml().replace(
      '<div class="container" id="root"><div><div></div><h1>Nested heading</h1></div><p>Rendered copy.</p></div>',
      '<div id="root"><!--visible?--><script>copy</script><style>.copy{}</style><noscript>fallback</noscript><template><h1>Hidden title</h1>hidden</template><h1><span> </span><!--nothing--></h1></div>',
    ),
  });
  const result = f.run();
  assert.equal(result.status, 1);
  assert.ok(hasIssue(result, "PUBLIC_HTML_MISSING_CONTENT", "hasStaticH1"));
  assert.ok(hasIssue(result, "PUBLIC_HTML_MISSING_CONTENT", "rootHasText"));
});

test("JSON-LD must contain valid nonempty structured JSON, not only a script tag", () => {
  for (const invalid of ["", "{broken", "null", "[]", "{}", '"text"']) {
    const result = fixture({ html: publicHtml().replace('{"@context":"https://schema.org","@type":"WebPage"}', invalid) }).run();
    assert.equal(result.status, 1);
    assert.ok(hasIssue(result, "PUBLIC_HTML_MISSING_CONTENT", "hasValidJsonLd"));
    assert.equal(result.report.routes[0].metadata.jsonLd[0].valid, false);
  }
});

test("missing entry, static/dynamic JS, transitive CSS and manifest assets are fatal in either mode", () => {
  const cases = [
    { "index.html": entry({ file: "assets/missing-entry.js" }) },
    { "index.html": entry({ imports: ["dep"] }), dep: { file: "assets/missing-static.js" } },
    { "index.html": entry({ dynamicImports: ["dep"] }), dep: { file: "assets/missing-dynamic.js" } },
    { "index.html": entry({ imports: ["dep"] }), dep: { file: "assets/main.js", css: ["assets/missing.css"] } },
    { "index.html": entry({ dynamicImports: ["dep"] }), dep: { file: "assets/main.js", imports: ["transitive"] }, transitive: { file: "assets/main.js", assets: ["assets/missing.woff2"] } },
  ];
  for (const manifest of cases) {
    const result = fixture({ manifest }).run(["--profile", "app"]);
    assert.equal(result.status, 2, result.stdout);
    assert.ok(hasIssue(result, "INVALID_OR_MISSING_FILE"));
    assert.match(result.stderr, /missing/);
  }
});

test("missing static/dynamic manifest records, including behind mixed edges, are fatal", () => {
  for (const manifest of [
    { "index.html": entry({ imports: ["missing"] }) },
    { "index.html": entry({ dynamicImports: ["missing"] }) },
    { "index.html": entry({ dynamicImports: ["page"] }), page: { file: "assets/main.js", imports: ["bridge"] }, bridge: { file: "assets/main.js", dynamicImports: ["missing"] } },
  ]) {
    const result = fixture({ manifest }).run(["--profile", "app"]);
    assert.equal(result.status, 2);
    assert.ok(hasIssue(result, "MISSING_MANIFEST_RECORD"));
    assert.match(result.stderr, /missing/);
  }
});

test("missing locally referenced HTML assets are errors, not dropped from totals", () => {
  for (const extra of [
    '<script src="/assets/missing.js"></script>',
    '<link rel="stylesheet" href="/assets/missing.css">',
    '<link rel="modulepreload" href="/assets/missing.js">',
    '<link rel="preload" as="font" href="/fonts/missing.woff2">',
    '<link rel="preload" as="image" href="/img/missing.webp">',
  ]) {
    const result = fixture({ html: publicHtml(extra) }).run();
    assert.equal(result.status, 2);
    assert.ok(hasIssue(result, "INVALID_OR_MISSING_FILE"));
  }
  for (const candidate of ['<img src="/img/missing.webp">', '<img srcset="/img/missing.webp 1x">', '<video poster="/img/missing.webp"></video>']) {
    const result = fixture({ html: publicHtml().replace("</body>", `${candidate}</body>`) }).run();
    assert.equal(result.status, 2);
    assert.ok(result.report.routes[0].imageCandidates.some((item) => item.status === "missing"));
  }
});

test("all secondary HTML routes are discovered and checked, not only index", () => {
  const f = fixture({
    manifest: { "index.html": entry(), "about/index.html": { file: "assets/about.js", isEntry: true } },
    files: { "about/index.html": appHtml("", "/assets/about.js"), "assets/about.js": "about" },
  });
  const result = f.run();
  assert.equal(result.status, 1);
  assert.equal(result.report.assets.html.length, 2);
  assert.deepEqual(result.report.routes.map((item) => item.url).sort(), ["/", "/about/"]);
  assert.ok(result.report.warnings.some((item) => item.route === "/about/" && item.code === "PUBLIC_HTML_MISSING_CONTENT"));
});

test("entry inference by script output works; ambiguous or missing matches require config", () => {
  const f = fixture({
    manifest: { "src/main.tsx": entry(), other: { file: "assets/other.js", isEntry: true } },
    files: { "assets/other.js": "other" },
  });
  const good = f.run();
  assert.equal(good.status, 0);
  assert.equal(good.report.routes[0].entry, "src/main.tsx");
  f.write("dist/index.html", publicHtml('<script type="module" src="/assets/other.js"></script>'));
  const ambiguous = f.run();
  assert.equal(ambiguous.status, 2);
  assert.ok(hasIssue(ambiguous, "AMBIGUOUS_HTML_ENTRY"));
  f.write("audit.json", { routes: [route({ entry: "src/main.tsx" })] });
  assert.equal(f.run(["--profile", "marketing", "--config", "audit.json", "--strict"]).status, 0);
});

test("matching HTML manifest key does not hide a second entry; mapping accounts for both graphs", () => {
  const f = fixture({
    html: publicHtml('<script type="module" src="/assets/other.js"></script>'),
    manifest: {
      "index.html": entry(),
      other: { file: "assets/other.js", isEntry: true, imports: ["shared"], dynamicImports: ["page"] },
      shared: { file: "assets/shared.js", css: ["assets/shared.css"] },
      page: { file: "assets/page.js" },
    },
    files: { "assets/other.js": "other", "assets/shared.js": "shared", "assets/shared.css": "css", "assets/page.js": "page" },
    config: { routes: [route()] },
  });
  assert.ok(hasIssue(f.run(), "AMBIGUOUS_HTML_ENTRY"));
  const result = f.run(["--profile", "app", "--config", "audit.json", "--strict"]);
  assert.equal(result.status, 1);
  assert.equal(result.report.routes[0].initialJs.raw, 21 + 5 + 6);
  assert.equal(result.report.routes[0].initialCss.raw, 3);
  assert.ok(hasIssue(result, "UNCLASSIFIED_DYNAMIC_IMPORT"));
  assert.deepEqual(result.report.routes[0].htmlScriptManifestKeys, ["index.html", "other"]);
});

test("configured routes inventory unmapped/ignored HTML and allow shared app shells", () => {
  const f = fixture({
    html: appHtml(),
    files: { "404.html": appHtml(), "unmapped.html": appHtml() },
    config: {
      routes: [route(), route({ url: "/dashboard" })],
      ignoredHtml: [{ file: "404.html", reason: "Platform fallback checked separately" }],
    },
  });
  const result = f.run(["--profile", "app", "--config", "audit.json", "--strict"]);
  assert.equal(result.status, 1);
  assert.equal(result.report.routes.length, 2);
  assert.deepEqual(result.report.assets.html.find((item) => item.file === "index.html").routes, ["/", "/dashboard"]);
  assert.equal(result.report.assets.html.find((item) => item.file === "404.html").status, "ignored");
  assert.ok(result.report.warnings.some((item) => item.code === "UNMAPPED_HTML" && item.file === "unmapped.html"));
});

test("hybrid enforces public content but permits explicitly private CSR shells", () => {
  const f = fixture({
    manifest: { "index.html": entry(), "app.html": { file: "assets/app.js", isEntry: true } },
    files: { "app.html": appHtml("", "/assets/app.js"), "assets/app.js": "app" },
    config: { routes: [route({ kind: "public" }), route({ url: "/app", html: "app.html", entry: "app.html", kind: "app" })] },
  });
  const result = f.run(["--profile", "hybrid", "--config", "audit.json", "--strict"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.report.routes[1].metadata.rootHasText, false);
});

test("unreferenced font inventory is not initial; declarations/preloads deduplicate and enforce bytes/count", () => {
  const fonts = {
    "fonts/unused.woff2": Buffer.alloc(120 * 1024),
    "fonts/main.woff2": Buffer.alloc(110 * 1024),
    "fonts/two.woff2": "two",
    "fonts/three.woff2": "three",
  };
  const f = fixture({ files: fonts, config: { routes: [route()] } });
  const baseline = f.run(["--profile", "marketing", "--config", "audit.json", "--strict"]);
  assert.equal(baseline.status, 0);
  assert.equal(baseline.report.assets.fonts.length, 4);
  assert.equal(baseline.report.routes[0].initialFonts.count, 0);
  f.write("dist/index.html", publicHtml('<link href="/fonts/main.woff2" as="font" rel="preload">'));
  const preloadOnly = f.run(["--profile", "marketing", "--config", "audit.json", "--strict"]);
  assert.equal(preloadOnly.status, 1);
  assert.equal(preloadOnly.report.routes[0].initialFonts.count, 1);
  assert.ok(hasIssue(preloadOnly, "BUDGET_EXCEEDED", "initialFontRaw"));
  f.write("audit.json", { routes: [route({ initialFonts: ["/fonts/main.woff2?version=1", "/fonts/two.woff2", "/fonts/three.woff2"] })] });
  const result = f.run(["--profile", "app", "--config", "audit.json", "--strict"]);
  assert.equal(result.status, 1);
  assert.equal(result.report.routes[0].initialFonts.count, 3);
  assert.equal(result.report.routes[0].initialFonts.raw, 110 * 1024 + 8);
  assert.equal(result.report.routes[0].initialFonts.files.find((item) => item.file === "fonts/main.woff2").sources.length, 2);
  assert.ok(hasIssue(result, "BUDGET_EXCEEDED", "initialFontRaw"));
  assert.ok(hasIssue(result, "BUDGET_EXCEEDED", "initialFontCount"));
});

test("only explicit LCP image gets a budget; HTML images remain candidates, not LCP measurements", () => {
  const f = fixture({
    html: publicHtml().replace("</body>", '<img src="/img/large.webp" srcset="/img/small.webp 1x, /img/large.webp 2x"><video poster="/img/small.webp"></video></body>'),
    files: { "img/large.webp": Buffer.alloc(300 * 1024), "img/small.webp": "small" },
    config: { routes: [route()] },
  });
  const baseline = f.run(["--profile", "marketing", "--config", "audit.json", "--strict"]);
  assert.equal(baseline.status, 0);
  assert.equal(baseline.report.routes[0].lcpImage.status, "not-declared");
  assert.equal(baseline.report.routes[0].imageCandidates.length, 4);
  f.write("audit.json", { routes: [route({ lcpImage: "/img/large.webp" })] });
  const result = f.run(["--profile", "marketing", "--config", "audit.json", "--strict"]);
  assert.equal(result.status, 1);
  assert.ok(hasIssue(result, "BUDGET_EXCEEDED", "lcpImageRaw"));
  assert.equal(result.report.routes[0].lcpImage.size.raw, 300 * 1024);
});

test("srcset covers width/density, embedded URL commas and preload image candidates", () => {
  const f = fixture({
    html: publicHtml('<link rel="preload" as="image" imagesrcset="/img/a,b.webp .5x, /img/large.webp 2x">')
      .replace("</body>", '<picture><source srcset="/img/small.webp 300w,/img/large.webp 600w"><img src="/img/small.webp"></picture></body>'),
    files: { "img/a,b.webp": "ab", "img/large.webp": "large", "img/small.webp": "small" },
  });
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.report.routes[0].imageCandidates.length, 5);
  assert.ok(result.report.routes[0].imageCandidates.some((item) => item.file === "img/a,b.webp"));
});

test("remote assets, srcset limitations and remote/unresolved LCP are explicitly unverified", () => {
  const f = fixture({
    html: publicHtml('<script src="https://example.test/same-origin-maybe.js"></script><link as="image" rel="preload" href="//cdn.test/hero.webp">')
      .replace("</body>", '<img srcset="data:image/png;base64,AAAA 1x"></body>'),
    config: { routes: [route({ lcpImage: "https://cdn.test/hero.webp", initialFonts: ["https://cdn.test/font.woff2"] })] },
  });
  const result = f.run(["--profile", "app", "--config", "audit.json"]);
  assert.equal(result.status, 0);
  assert.equal(result.report.routes[0].lcpImage.status, "unverified");
  assert.equal(result.report.routes[0].lcpImage.size, null);
  assert.equal(result.report.routes[0].externalScriptCandidates.length, 1);
  assert.equal(result.report.routes[0].initialFonts.count, 1);
  assert.equal(result.report.routes[0].initialFonts.localCount, 0);
  assert.ok(hasIssue(result, "UNVERIFIED_SRCSET"));
  f.write("audit.json", { base: "/site/", routes: [route({ lcpImage: "/outside.webp" })] });
  const unresolved = f.run(["--profile", "app", "--config", "audit.json"]);
  assert.equal(unresolved.report.routes[0].lcpImage.status, "unverified");
});

test("config base resolves root/relative assets, query strings, encoded paths and logical routes", () => {
  const f = fixture({
    html: publicHtml('<link rel="stylesheet" href="/site/assets/main.css?v=1"><link rel="preload" as="font" href="fonts/main.woff2">', "/site/assets/main.js?v=1"),
    files: { "assets/main.css": "css", "fonts/main.woff2": "font", "img/hero image.webp": "hero" },
    config: { base: "/site", routes: [route({ url: "/./", lcpImage: "/site/img/hero%20image.webp?cache=1", initialFonts: ["/site/fonts/main.woff2"] })] },
  });
  const result = f.run(["--profile", "marketing", "--config", "audit.json", "--strict"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.report.base, "/site/");
  assert.equal(result.report.routes[0].url, "/");
  assert.equal(result.report.routes[0].initialJs.files.length, 1);
  assert.equal(result.report.routes[0].initialCss.raw, 3);
  assert.equal(result.report.routes[0].initialFonts.count, 1);
  assert.equal(result.report.routes[0].lcpImage.file, "img/hero image.webp");
});

test("nested HTML relative URLs and HTML base href are respected", () => {
  const f = fixture({
    html: null,
    manifest: { "about/index.html": entry() },
    files: {
      "about/index.html": publicHtml('<base href="/site/"><link rel="stylesheet" href="assets/main.css">', "assets/main.js"),
      "assets/main.css": "css",
    },
    config: { base: "/site/", routes: [route({ url: "/site/about/", html: "about/index.html", entry: "about/index.html" })] },
  });
  const result = f.run(["--profile", "marketing", "--config", "audit.json", "--strict"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.report.routes[0].initialCss.raw, 3);
});

test("missing dist/manifest/HTML/config and malformed manifest always exit two", () => {
  const f = fixture();
  assert.equal(f.run(["--profile", "app", "--dist", "missing"]).status, 2);
  assert.equal(f.run(["--profile", "app", "--config", "missing.json"]).status, 2);
  f.write("dist/.vite/manifest.json", "{");
  assert.ok(hasIssue(f.run(["--profile", "app"]), "INVALID_MANIFEST"));
  fs.rmSync(path.join(f.cwd, "dist/.vite/manifest.json"));
  assert.ok(hasIssue(f.run(["--profile", "app"]), "MISSING_MANIFEST"));
  f.write("dist/manifest.json", { "index.html": entry() });
  assert.equal(f.run().status, 0);
  fs.rmSync(path.join(f.cwd, "dist/index.html"));
  const result = f.run(["--profile", "app"]);
  assert.equal(result.status, 2);
  assert.ok(hasIssue(result, "MISSING_HTML"));
});

test("CLI requires valid explicit profile and rejects unknown/duplicate/missing flags", () => {
  const f = fixture();
  for (const args of [
    [], ["--strict"], ["--profile"], ["--profile", "wat"],
    ["--profile", "app", "--dist"], ["--profile", "app", "--config", "--strict"],
    ["--profile", "app", "--unknown"], ["--profile", "app", "positional"],
    ["--profile", "app", "--strict", "--strict"], ["--profile", "app", "--profile", "marketing"],
    ["--profile", "hybrid"], ["--profile", "app", "--dist", ""],
  ]) {
    const result = f.run(args);
    assert.equal(result.status, 2, JSON.stringify(args));
    assert.match(result.stderr, /audit error/);
  }
  const removed = f.run(["--profile", "app", "--allow-dynamic", "about"]);
  assert.equal(removed.status, 2);
  assert.match(removed.stderr, /migrate.*exact manifest keys/);
});

test("malformed config shapes, unknown fields and invalid values have clear errors", () => {
  const invalids = [
    "{", null, [], {}, { routes: [] }, { routes: [route()], unknown: true },
    { routes: [route()], base: "https://cdn.test/" }, { routes: [route()], base: null },
    { routes: [route()], budgets: null }, { routes: [route()], budgets: { initialJsRaw: -1 } },
    { routes: [route()], budgets: { initialJsRaw: "10" } }, { routes: [route()], budgets: { initialFontCount: 0.1 } },
    { routes: [route()], budgets: { typo: 1 } }, { routes: [route({ url: "relative" })] },
    { routes: [route({ url: "/%zz" })] }, { routes: [route({ html: "/index.html" })] },
    { routes: [route({ html: "../index.html" })] }, { routes: [route({ html: "index.txt" })] },
    { routes: [route({ entry: "" })] }, { routes: [route({ kind: "private" })] },
    { routes: [route({ initialFonts: null })] }, { routes: [route({ initialFonts: [1] })] },
    { routes: [route({ initialDynamicImports: "page" })] }, { routes: [route({ deferredDynamicImports: [{}] })] },
    { routes: [route({ deferredDynamicImports: [deferred("page", { reason: " " })] })] },
    { routes: [route({ deferredDynamicImports: [deferred("page", { trigger: "startup" })] })] },
    { routes: [route({ lcpImage: "" })] }, { routes: [route(), route({ url: "/./" })] },
    { routes: [route()], ignoredHtml: [{ file: "404.html", reason: "" }] },
    { routes: [route()], ignoredHtml: [{ file: "index.html", reason: "conflict" }] },
  ];
  const f = fixture();
  for (const config of invalids) {
    f.write("audit.json", config === null ? "null" : config);
    const result = f.run(["--profile", "app", "--config", "audit.json"]);
    assert.equal(result.status, 2, JSON.stringify(config));
    assert.ok(hasIssue(result, "INVALID_CONFIG"), result.stdout);
    assert.match(result.stderr, /Invalid config/);
  }
  f.write("audit.json", { routes: [route()] });
  assert.ok(hasIssue(f.run(["--profile", "hybrid", "--config", "audit.json"]), "INVALID_CONFIG"));
});

test("dynamic declarations require exact reachable keys, no duplicates or conflicts", () => {
  const f = fixture({
    manifest: {
      "index.html": entry({ imports: ["shared"], dynamicImports: ["page"] }),
      page: { file: "assets/page.js" },
      shared: { file: "assets/shared.js" },
      orphan: { file: "assets/orphan.js" },
    },
    files: { "assets/page.js": "page", "assets/shared.js": "shared", "assets/orphan.js": "orphan" },
  });
  for (const declaration of [
    { initialDynamicImports: ["pag"] },
    { initialDynamicImports: ["orphan"] },
    { deferredDynamicImports: [deferred("assets/page.js")] },
    { deferredDynamicImports: [deferred("shared")] },
    { initialDynamicImports: ["page", "page"] },
    { deferredDynamicImports: [deferred("page"), deferred("page")] },
    { initialDynamicImports: ["page"], deferredDynamicImports: [deferred("page")] },
  ]) {
    f.write("audit.json", { routes: [route(declaration)] });
    assert.equal(f.run(["--profile", "app", "--config", "audit.json"]).status, 2, JSON.stringify(declaration));
  }
  f.write("dist/.vite/manifest.json", {
    "index.html": entry({ imports: ["page"], dynamicImports: ["page"] }), page: { file: "assets/page.js" },
  });
  f.write("audit.json", { routes: [route({ deferredDynamicImports: [deferred("page")] })] });
  assert.ok(hasIssue(f.run(["--profile", "app", "--config", "audit.json"]), "CONFLICTING_DYNAMIC_DECLARATION"));
});

test("declared route HTML and entries and ignored files must exist", () => {
  for (const config of [
    { routes: [route({ html: "missing.html" })] },
    { routes: [route({ entry: "missing" })] },
    { routes: [route()], ignoredHtml: [{ file: "404.html", reason: "fallback" }] },
  ]) {
    const result = fixture({ config }).run(["--profile", "app", "--config", "audit.json"]);
    assert.equal(result.status, 2);
    assert.ok(result.report.errors.length > 0);
  }
});

test("path traversal, broken/escaping symlinks and malformed asset URLs are fatal", () => {
  const f = fixture({ manifest: { "index.html": entry({ imports: ["bad"] }), bad: { file: "../outside.js" } } });
  assert.equal(f.run(["--profile", "app"]).status, 2);
  f.write("dist/.vite/manifest.json", { "index.html": entry({ css: ["../outside.css"] }) });
  assert.equal(f.run(["--profile", "app"]).status, 2);
  f.write("dist/.vite/manifest.json", { "index.html": entry() });
  for (const url of ["/../../outside.webp", "/%2e%2e/outside.webp", "/%zz.webp", "/bad%5cpath.webp"]) {
    f.write("dist/index.html", publicHtml().replace("</body>", `<img src="${url}"></body>`));
    assert.equal(f.run(["--profile", "app"]).status, 2, url);
  }
  f.write("outside.js", "outside");
  fs.rmSync(path.join(f.cwd, "dist/assets/main.js"));
  fs.symlinkSync(path.join(f.cwd, "outside.js"), path.join(f.cwd, "dist/assets/main.js"));
  f.write("dist/index.html", publicHtml());
  const result = f.run(["--profile", "app"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /symlink escapes dist/);
});

test("custom budgets include zero thresholds and dist/config resolve from project cwd", () => {
  const f = fixture({ config: { budgets: { initialJsRaw: 0 }, routes: [route()] } });
  fs.renameSync(path.join(f.cwd, "dist"), path.join(f.cwd, "build-output"));
  fs.mkdirSync(path.join(f.cwd, "config"));
  fs.renameSync(path.join(f.cwd, "audit.json"), path.join(f.cwd, "config/audit.json"));
  const result = f.run(["--profile", "app", "--dist", "./build-output", "--config", "config/audit.json", "--strict"]);
  assert.equal(result.status, 1);
  assert.equal(result.report.dist, "build-output");
  assert.ok(hasIssue(result, "BUDGET_EXCEEDED", "initialJsRaw"));
});

test("initial CSS uses summed numeric compression estimates and enforces its Brotli budget", () => {
  const css = noisyBytes(50 * 1024);
  const result = fixture({
    manifest: { "index.html": entry({ css: ["assets/main.css"] }) },
    files: { "assets/main.css": css },
  }).run();
  assert.equal(result.status, 1);
  assert.equal(result.report.routes[0].initialCss.raw, css.length);
  assert.equal(result.report.routes[0].initialCss.gzip, gzipSync(css).length);
  assert.equal(result.report.routes[0].initialCss.brotli, brotliCompressSync(css).length);
  assert.ok(hasIssue(result, "BUDGET_EXCEEDED", "initialCssBrotli"));
});

test("declared remote fonts count toward the count budget without invented byte sizes", () => {
  const result = fixture({
    config: { routes: [route({ initialFonts: ["https://cdn.test/a.woff2", "https://cdn.test/b.woff2", "https://cdn.test/c.woff2"] })] },
  }).run(["--profile", "app", "--config", "audit.json", "--strict"]);
  assert.equal(result.status, 1);
  assert.equal(result.report.routes[0].initialFonts.count, 3);
  assert.equal(result.report.routes[0].initialFonts.raw, 0);
  assert.equal(result.report.routes[0].initialFonts.localCount, 0);
  assert.ok(hasIssue(result, "BUDGET_EXCEEDED", "initialFontCount"));
});

test("raw HTML scripts/styles absent from manifest still contribute to initial totals", () => {
  const result = fixture({
    html: publicHtml('<script src="/assets/vendor.js" defer></script><link rel="stylesheet" href="/assets/extra.css">'),
    files: { "assets/vendor.js": "vendor", "assets/extra.css": "extra-css" },
  }).run();
  assert.equal(result.status, 0);
  assert.equal(result.report.routes[0].initialJs.raw, 27);
  assert.equal(result.report.routes[0].initialCss.raw, 9);
});

test("metadata deployment files are existence-only, with no invented HTTP verification", () => {
  const f = fixture();
  fs.rmSync(path.join(f.cwd, "dist/_headers"));
  const result = f.run();
  assert.equal(result.status, 0);
  assert.deepEqual(result.report.assets.metadataFiles._headers, { exists: false, verification: "existence-only" });
  assert.equal(result.report.verification.http, "not-run");
});

test("explicit/preloaded extensionless fonts are counted independently of extension inventory", () => {
  const result = fixture({
    html: publicHtml('<link as="font" rel="preload" href="/fonts/body">'),
    files: { "fonts/body": "font" },
    config: { routes: [route({ initialFonts: ["/fonts/body"] })] },
  }).run(["--profile", "marketing", "--config", "audit.json", "--strict"]);
  assert.equal(result.status, 0);
  assert.equal(result.report.assets.fonts.length, 0);
  assert.equal(result.report.routes[0].initialFonts.count, 1);
  assert.equal(result.report.routes[0].initialFonts.raw, 4);
});

test("declared initial nested imports retain depth two rather than a boolean depth", () => {
  const result = fixture({
    manifest: {
      "index.html": entry({ dynamicImports: ["page"] }),
      page: { file: "assets/page.js", imports: ["helper"] },
      helper: { file: "assets/helper.js", dynamicImports: ["hero"] },
      hero: { file: "assets/hero.js" },
    },
    files: { "assets/page.js": "page", "assets/helper.js": "helper", "assets/hero.js": "hero" },
    config: { routes: [route({ initialDynamicImports: ["page", "hero"] })] },
  }).run(["--profile", "app", "--config", "audit.json", "--strict"]);
  assert.equal(result.status, 1);
  assert.equal(result.report.routes[0].initialDepth, 2);
  assert.equal(result.report.routes[0].initialJs.raw, 21 + 4 + 6 + 4);
});

test("dist-relative initial font declarations work on nested routes independently of HTML base", () => {
  const result = fixture({
    html: publicHtml('<base href="/site/elsewhere/">', "/site/assets/main.js"),
    files: { "fonts/body.woff2": "font" },
    config: { base: "/site/", routes: [route({ url: "/site/about/", initialFonts: ["fonts/body.woff2"] })] },
  }).run(["--profile", "app", "--config", "audit.json", "--strict"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.report.routes[0].initialFonts.raw, 4);
  assert.equal(result.report.routes[0].initialFonts.files[0].file, "fonts/body.woff2");
});

test("logical and base-prefixed aliases cannot declare the same deployment route twice", () => {
  const result = fixture({
    config: { base: "/site/", routes: [route(), route({ url: "/site/" })] },
  }).run(["--profile", "app", "--config", "audit.json"]);
  assert.equal(result.status, 2);
  assert.ok(hasIssue(result, "INVALID_CONFIG"));
  assert.match(result.stderr, /duplicate normalized route URL/);
});

test("a route exactly matching the base directory is not prefixed twice", () => {
  const result = fixture({
    html: publicHtml("", "/site/assets/main.js"),
    config: { base: "/site/", routes: [route({ url: "/site" })] },
  }).run(["--profile", "app", "--config", "audit.json", "--strict"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.report.routes[0].initialJs.raw, 21);
});

test("dense dynamic cycles fail explicitly within a bounded analysis rather than hanging", () => {
  const keys = Array.from({ length: 12 }, (_, index) => `module-${index}`);
  const manifest = {
    root: { dynamicImports: [keys[0]] },
    ...Object.fromEntries(keys.map((key) => [key, { dynamicImports: keys.filter((other) => other !== key) }])),
  };
  assert.throws(() => analyzeGraph(manifest, "root"), /GRAPH_ANALYSIS_LIMIT/);
});
