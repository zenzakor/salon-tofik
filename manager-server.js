const http = require("http");
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const host = "127.0.0.1";
const port = Number(process.env.PORT || 4173);
const sitesFile = path.join(root, "sites.json");
const managedRoot = path.join(root, "managed-sites");

const rootSiteFiles = [
  "index.html",
  "book.html",
  "shop.html",
  "cart.html",
  "account.html",
  "old-bookings.html",
  "privacy.html",
  "terms.html",
  "admin.html"
];

const firebaseCollections = [
  "Users",
  "Appointments",
  "Orders",
  "PaymentRecords",
  "Invoices",
  "Carts",
  "Notifications",
  "Products",
  "Reviews",
  "SiteContent",
  "Workers",
  "WorkerShifts",
  "MonthlyReports",
  "WhatsappInvoiceSends"
];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const settingsScript = `(function () {
  function normalizePath(value) {
    return String(value || "").trim();
  }

  function replaceText(root, settings) {
    if (!settings.siteName) return;
    var replacements = [
      ["Salon Tofik", settings.siteName],
      ["SALON TOFIK", settings.siteName.toUpperCase()],
      ["TOFIK ZAKOR", settings.siteName],
      ["صالون توفيق", settings.siteName],
      ["صالون توفيق", settings.siteName]
    ];
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      var nextValue = node.nodeValue;
      replacements.forEach(function (pair) {
        nextValue = nextValue.split(pair[0]).join(pair[1]);
      });
      if (nextValue !== node.nodeValue) node.nodeValue = nextValue;
    }
  }

  function applySettings(settings) {
    var siteName = normalizePath(settings.siteName);
    var phone = normalizePath(settings.phone);
    var whiteLogo = normalizePath(settings.whiteLogo);
    var blackLogo = normalizePath(settings.blackLogo);

    if (siteName) {
      document.title = document.title
        .replace(/Salon Tofik/gi, siteName)
        .replace(/TOFIK ZAKOR/gi, siteName)
        .replace(/صالون توفيق/g, siteName)
        .replace(/صالون توفيق/g, siteName);
      replaceText(document.body, settings);
      document.querySelectorAll("img[alt]").forEach(function (image) {
        var alt = image.getAttribute("alt") || "";
        if (/tofik|صالون/i.test(alt)) image.setAttribute("alt", siteName);
      });
    }

    document.querySelectorAll("img").forEach(function (image) {
      var src = image.getAttribute("src") || "";
      if (whiteLogo && src.indexOf("logo-white") !== -1) image.setAttribute("src", whiteLogo);
      if (blackLogo && src.indexOf("logo-black") !== -1) image.setAttribute("src", blackLogo);
    });

    if (phone) {
      document.querySelectorAll('a[href^="tel:"]').forEach(function (link) {
        link.setAttribute("href", "tel:" + phone.replace(/[^+0-9]/g, ""));
        if (!link.textContent.trim()) link.textContent = phone;
      });
      document.querySelectorAll("[data-site-phone]").forEach(function (node) {
        node.textContent = phone;
      });
    }
  }

  fetch("site-settings.json", { cache: "no-store" })
    .then(function (response) {
      if (!response.ok) throw new Error("settings_not_found");
      return response.json();
    })
    .then(applySettings)
    .catch(function () {});
})();`;

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
}

function sendText(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type });
  res.end(body);
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function defaultSettings(site = {}) {
  return {
    siteName: site.name || "Salon Tofik",
    phone: "",
    whiteLogo: "assets/logo-white.png",
    blackLogo: "assets/logo-black.png",
    firebaseConfig: ""
  };
}

function databasePrefix(site) {
  return `site_${slugify(site.id || site.name || "website").replace(/-/g, "_")}`;
}

function databaseSettings(site = {}) {
  const prefix = site.database?.prefix || databasePrefix(site);
  const collections = {};
  for (const name of firebaseCollections) collections[name] = `${prefix}_${name}`;
  return {
    isolated: site.source === "managed",
    prefix,
    collections
  };
}

function mergeSettings(site, settings = {}) {
  return {
    ...defaultSettings(site),
    ...(site.settings || {}),
    ...settings
  };
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.promises.readFile(filePath, "utf8"));
  } catch (error) {
    return fallback;
  }
}

async function writeSitesConfig(config) {
  await fs.promises.writeFile(sitesFile, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

async function ensureSitesConfig() {
  const config = await readJson(sitesFile, null);
  const initial = config && Array.isArray(config.sites)
    ? config
    : {
        sites: [
          {
            id: "salon-tofik",
            name: "Salon Tofik",
            category: "Salons",
            entry: "index.html",
            source: "root",
            createdAt: new Date().toISOString()
          }
        ]
      };

  let changed = false;
  initial.sites = initial.sites.map((site) => {
    let nextSite = site;
    if (!nextSite.settings) {
      changed = true;
      nextSite = { ...nextSite, settings: defaultSettings(nextSite) };
    }
    if (nextSite.source === "managed" && !nextSite.database?.isolated) {
      changed = true;
      nextSite = { ...nextSite, database: databaseSettings(nextSite) };
    }
    return nextSite;
  });
  if (changed || !config) await writeSitesConfig(initial);
  return initial;
}

async function pathExists(filePath) {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

async function readByteSafeText(filePath) {
  const buffer = await fs.promises.readFile(filePath);
  return buffer.toString("latin1");
}

async function writeByteSafeText(filePath, content) {
  await fs.promises.writeFile(filePath, Buffer.from(content, "latin1"));
}

function assertInsideRoot(targetPath) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(targetPath);
  if (!resolvedTarget.startsWith(resolvedRoot)) throw new Error("unsafe_path");
  return resolvedTarget;
}

async function copyFileIfExists(source, target) {
  if (!(await pathExists(source))) return;
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  await fs.promises.copyFile(source, target);
}

async function copyDirectory(sourceDir, targetDir) {
  const safeSource = assertInsideRoot(sourceDir);
  const safeTarget = assertInsideRoot(targetDir);
  await fs.promises.mkdir(safeTarget, { recursive: true });
  const entries = await fs.promises.readdir(safeSource, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(safeSource, entry.name);
    const targetPath = path.join(safeTarget, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath);
    } else if (entry.isFile()) {
      await copyFileIfExists(sourcePath, targetPath);
    }
  }
}

async function copyRootSite(targetDir) {
  const safeTarget = assertInsideRoot(targetDir);
  await fs.promises.mkdir(safeTarget, { recursive: true });

  for (const file of rootSiteFiles) {
    await copyFileIfExists(path.join(root, file), path.join(safeTarget, file));
  }

  await copyDirectory(path.join(root, "assets"), path.join(safeTarget, "assets"));
}

function getSiteBaseDirectory(site) {
  if (site.source === "managed" && site.folder) return path.join(root, site.folder);
  return root;
}

function getSiteHtmlFiles(site) {
  const baseDir = getSiteBaseDirectory(site);
  if (site.source === "managed") {
    return rootSiteFiles.map((file) => path.join(baseDir, file));
  }
  return rootSiteFiles.map((file) => path.join(root, file));
}

async function getSiteCodeFiles(site) {
  const baseDir = getSiteBaseDirectory(site);
  const files = [];
  for (const htmlFile of getSiteHtmlFiles(site)) files.push(htmlFile);

  const assetsDir = path.join(baseDir, "assets");
  if (await pathExists(assetsDir)) {
    const entries = await fs.promises.readdir(assetsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".js")) files.push(path.join(assetsDir, entry.name));
    }
  }
  return files;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceCollectionLiteral(source, originalName, scopedName) {
  const token = `(?:site_[a-z0-9_]+_)?${escapeRegExp(originalName)}`;
  const patterns = [
    new RegExp(`(collection\\(\\s*db\\s*,\\s*)(["'])${token}\\2`, "g"),
    new RegExp(`(doc\\(\\s*db\\s*,\\s*)(["'])${token}\\2`, "g"),
    new RegExp(`(sourceCollection\\s*:\\s*)(["'])${token}\\2`, "g"),
    new RegExp(`(\\{\\s*name\\s*:\\s*)(["'])${token}\\2`, "g"),
    new RegExp(`(\\[\\s*)(["'])${token}\\2`, "g")
  ];

  return patterns.reduce((nextSource, pattern) => {
    return nextSource.replace(pattern, (_match, prefix, quote) => `${prefix}${quote}${scopedName}${quote}`);
  }, source);
}

function extractFirebaseConfigObject(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const assigned = raw.match(/(?:const|let|var)\s+firebaseConfig\s*=\s*({[\s\S]*?})\s*;?\s*$/);
  const objectText = (assigned ? assigned[1] : raw).trim();
  if (!objectText.startsWith("{") || !objectText.endsWith("}")) {
    throw new Error("firebase_config_must_be_an_object");
  }
  return objectText;
}

function replaceFirebaseConfig(source, configObject) {
  return source.replace(
    /const\s+firebaseConfig\s*=\s*\{[\s\S]*?\};/g,
    `const firebaseConfig = ${configObject};`
  );
}

async function getDefaultFirebaseConfigObject() {
  const content = await readByteSafeText(path.join(root, "index.html"));
  const match = content.match(/const\s+firebaseConfig\s*=\s*(\{[\s\S]*?\})\s*;/);
  return match ? match[1].trim() : "";
}

async function applyDatabaseIsolation(site) {
  if (site.source !== "managed") return;
  const database = databaseSettings(site);
  const codeFiles = await getSiteCodeFiles(site);

  for (const file of codeFiles) {
    const safeFile = assertInsideRoot(file);
    if (!(await pathExists(safeFile))) continue;
    let content = await readByteSafeText(safeFile);
    const originalContent = content;
    for (const [originalName, scopedName] of Object.entries(database.collections)) {
      content = replaceCollectionLiteral(content, originalName, scopedName);
    }
    if (content !== originalContent) await writeByteSafeText(safeFile, content);
  }

  site.database = database;
}

async function applyFirebaseConfig(site, firebaseConfigValue) {
  if (site.source !== "managed") return;
  const configObject = extractFirebaseConfigObject(firebaseConfigValue) || await getDefaultFirebaseConfigObject();
  if (!configObject) return;
  const codeFiles = await getSiteCodeFiles(site);

  for (const file of codeFiles) {
    const safeFile = assertInsideRoot(file);
    if (!(await pathExists(safeFile))) continue;
    const content = await readByteSafeText(safeFile);
    const nextContent = replaceFirebaseConfig(content, configObject);
    if (nextContent !== content) await writeByteSafeText(safeFile, nextContent);
  }
}

function uploadExtension(upload) {
  const filename = String(upload?.filename || "").toLowerCase();
  const ext = path.extname(filename);
  if ([".png", ".jpg", ".jpeg", ".webp", ".svg"].includes(ext)) return ext;
  const mime = String(upload?.mime || "").toLowerCase();
  if (mime.includes("svg")) return ".svg";
  if (mime.includes("webp")) return ".webp";
  if (mime.includes("jpeg") || mime.includes("jpg")) return ".jpg";
  return ".png";
}

async function saveUploadedLogo(site, upload, logoName) {
  if (!upload?.dataBase64) return "";
  const baseDir = getSiteBaseDirectory(site);
  const assetsDir = assertInsideRoot(path.join(baseDir, "assets"));
  await fs.promises.mkdir(assetsDir, { recursive: true });
  const filename = `${logoName}${uploadExtension(upload)}`;
  const target = assertInsideRoot(path.join(assetsDir, filename));
  await fs.promises.writeFile(target, Buffer.from(upload.dataBase64, "base64"));
  return `assets/${filename}`;
}

async function writeRuntimeSettings(site, settings) {
  const baseDir = getSiteBaseDirectory(site);
  const settingsPath = assertInsideRoot(path.join(baseDir, "site-settings.json"));
  const scriptPath = assertInsideRoot(path.join(baseDir, "assets", "site-settings.js"));
  await fs.promises.mkdir(path.dirname(scriptPath), { recursive: true });
  await fs.promises.writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  await fs.promises.writeFile(scriptPath, settingsScript, "utf8");
}

async function injectSettingsScript(site) {
  const scriptTag = '<script src="assets/site-settings.js"></script>';
  for (const htmlFile of getSiteHtmlFiles(site)) {
    const safeFile = assertInsideRoot(htmlFile);
    if (!(await pathExists(safeFile))) continue;
    let html = await readByteSafeText(safeFile);
    if (html.includes('assets/site-settings.js')) continue;
    if (html.includes("</body>")) {
      html = html.replace("</body>", `    ${scriptTag}\n</body>`);
    } else {
      html += `\n${scriptTag}\n`;
    }
    await writeByteSafeText(safeFile, html);
  }
}

async function applySiteSettings(site, settings) {
  await applyDatabaseIsolation(site);
  await applyFirebaseConfig(site, settings.firebaseConfig);
  await writeRuntimeSettings(site, settings);
  await injectSettingsScript(site);
}

async function duplicateSite(payload) {
  const config = await ensureSitesConfig();
  const source = config.sites.find((site) => site.id === payload.sourceId);
  if (!source) throw new Error("source_site_not_found");

  const slug = slugify(payload.slug || payload.name);
  const name = String(payload.name || "").trim();
  if (!slug) throw new Error("missing_slug");
  if (!name) throw new Error("missing_name");
  if (config.sites.some((site) => site.id === slug)) throw new Error("site_id_already_exists");

  const targetDir = assertInsideRoot(path.join(managedRoot, slug));
  if (await pathExists(targetDir)) throw new Error("target_folder_already_exists");

  if (source.source === "managed" && source.folder) {
    await copyDirectory(path.join(root, source.folder), targetDir);
  } else {
    await copyRootSite(targetDir);
  }

  const nextSite = {
    id: slug,
    name,
    category: source.category || "Salons",
    entry: `managed-sites/${slug}/index.html`,
    source: "managed",
    folder: `managed-sites/${slug}`,
    copiedFrom: source.id,
    createdAt: new Date().toISOString(),
    settings: mergeSettings(source, { siteName: name, firebaseConfig: "" })
  };
  nextSite.database = databaseSettings(nextSite);

  await applySiteSettings(nextSite, nextSite.settings);
  config.sites.push(nextSite);
  await writeSitesConfig(config);
  return { site: nextSite, sites: config.sites };
}

async function isolateSiteDatabase(payload) {
  const config = await ensureSitesConfig();
  const site = config.sites.find((item) => item.id === payload.siteId);
  if (!site) throw new Error("site_not_found");
  if (site.source !== "managed") throw new Error("root_site_keeps_original_database");
  await applyDatabaseIsolation(site);
  await applySiteSettings(site, mergeSettings(site));
  await writeSitesConfig(config);
  return { site, sites: config.sites };
}

async function rebuildManagedSite(payload) {
  const config = await ensureSitesConfig();
  const site = config.sites.find((item) => item.id === payload.siteId);
  if (!site) throw new Error("site_not_found");
  if (site.source !== "managed" || !site.folder) throw new Error("only_managed_sites_can_be_rebuilt");

  const targetDir = assertInsideRoot(path.join(root, site.folder));
  await copyRootSite(targetDir);
  site.settings = mergeSettings(site);
  site.database = databaseSettings(site);
  await applySiteSettings(site, site.settings);
  await writeSitesConfig(config);
  return { site, sites: config.sites };
}

async function updateSiteSettings(payload) {
  const config = await ensureSitesConfig();
  const site = config.sites.find((item) => item.id === payload.siteId);
  if (!site) throw new Error("site_not_found");

  let settings = mergeSettings(site, payload.settings || {});
  const uploads = payload.uploads || {};
  const whiteLogo = await saveUploadedLogo(site, uploads.whiteLogo, "logo-white");
  const blackLogo = await saveUploadedLogo(site, uploads.blackLogo, "logo-black");
  if (whiteLogo) settings.whiteLogo = whiteLogo;
  if (blackLogo) settings.blackLogo = blackLogo;

  site.name = settings.siteName || site.name;
  site.settings = settings;
  await applySiteSettings(site, settings);
  await writeSitesConfig(config);
  return { site, sites: config.sites };
}

async function readRequestBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 12 * 1024 * 1024) throw new Error("request_too_large");
  }
  return body ? JSON.parse(body) : {};
}

async function handleApi(req, res, url) {
  try {
    if (req.method === "GET" && url.pathname === "/api/sites") {
      sendJson(res, 200, await ensureSitesConfig());
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/duplicate") {
      const body = await readRequestBody(req);
      const result = await duplicateSite(body);
      sendJson(res, 200, { ok: true, ...result });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/settings") {
      const body = await readRequestBody(req);
      const result = await updateSiteSettings(body);
      sendJson(res, 200, { ok: true, ...result });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/isolate-database") {
      const body = await readRequestBody(req);
      const result = await isolateSiteDatabase(body);
      sendJson(res, 200, { ok: true, ...result });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/rebuild-site") {
      const body = await readRequestBody(req);
      const result = await rebuildManagedSite(body);
      sendJson(res, 200, { ok: true, ...result });
      return;
    }

    sendJson(res, 404, { ok: false, error: "api_route_not_found" });
  } catch (error) {
    sendJson(res, 400, { ok: false, error: error.message || "request_failed" });
  }
}

function resolveStaticPath(pathname) {
  if (pathname === "/") return path.join(root, "sites-manager.html");
  const requested = path.normalize(path.join(root, decodeURIComponent(pathname)));
  return assertInsideRoot(requested);
}

async function serveStatic(req, res, url) {
  let filePath;
  try {
    filePath = resolveStaticPath(url.pathname);
  } catch (error) {
    sendText(res, 403, "Forbidden");
    return;
  }

  try {
    const stat = await fs.promises.stat(filePath);
    if (stat.isDirectory()) filePath = path.join(filePath, "index.html");
    const content = await fs.promises.readFile(filePath);
    const type = mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    sendText(res, 200, content, type);
  } catch (error) {
    sendText(res, 404, "Not found");
  }
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${host}:${port}`);
  if (url.pathname.startsWith("/api/")) {
    await handleApi(req, res, url);
    return;
  }
  await serveStatic(req, res, url);
}).listen(port, host, () => {
  console.log(`Sites manager: http://${host}:${port}/sites-manager.html`);
});
