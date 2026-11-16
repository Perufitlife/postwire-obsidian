// Loads main.js in a real Chromium page against a stub of the Obsidian API and a fake PostWire API.
import { createRequire } from "node:module";
import fs from "node:fs";
const { chromium } = createRequire(process.env.PW_REQUIRE_FROM || import.meta.url)("playwright");
const src = fs.readFileSync(new URL("../main.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const browser = await chromium.launch({ executablePath: process.env.PW_CHROME });
const page = await browser.newPage({ viewport: { width: 560, height: 620 } });
await page.setContent(`<style>body{font:14px system-ui;margin:0;padding:16px;--text-muted:#667;--size-4-1:4px;--size-4-2:8px;--size-4-3:12px;--size-2-1:2px;--background-modifier-border:#ccd;--radius-m:8px;--font-ui-smaller:12px;--font-ui-small:13px;--text-success:#0a7a35;--text-error:#b3261e}button{padding:8px 14px}${css}</style>`);
const out = await page.evaluate(async (src) => {
  const P = HTMLElement.prototype, F = DocumentFragment.prototype;
  const mk = function (tag, o = {}) { const e = document.createElement(tag); if (typeof o === "string") o = { cls: o }; if (o.text) e.textContent = o.text; if (o.cls) e.className = o.cls; if (o.type) e.type = o.type; if (o.href) e.href = o.href; this.appendChild(e); return e; };
  for (const X of [P, F]) { X.createEl = mk; X.createDiv = function (o) { return mk.call(this, "div", o); }; X.createSpan = function (o) { return mk.call(this, "span", o); }; X.appendText = function (t) { this.appendChild(document.createTextNode(t)); }; }
  P.empty = function () { this.replaceChildren(); }; P.setText = function (t) { this.textContent = t; }; P.addClass = function (c) { this.classList.add(c); }; P.setAttr = function (k, v) { this.setAttribute(k, v); };
  window.createFragment = (cb) => { const f = document.createDocumentFragment(); if (cb) cb(f); return f; };
  const calls = [], notices = []; let mode = "ok";
  const api = {
    Plugin: class { constructor() { this.app = { workspace: { on: () => ({}) } }; this.cmds = []; } loadData() { return this._data || null; } saveData(d) { this._data = JSON.parse(JSON.stringify(d)); } addSettingTab() {} addCommand(c) { this.cmds.push(c); } registerEvent() {} },
    PluginSettingTab: class {}, Setting: class {},
    Modal: class { constructor() { this.modalEl = document.body.createDiv("modal"); this.titleEl = this.modalEl.createEl("h3"); this.contentEl = this.modalEl.createDiv(); } open() { return this.onOpen(); } },
    Notice: class { constructor(m) { notices.push(m); } },
    requestUrl: async (r) => {
      calls.push({ url: r.url, method: r.method, headers: r.headers, body: r.body ? JSON.parse(r.body) : null });
      if (mode === "badkey") return { status: 401, json: { error: "bad key" } };
      if (r.url.endsWith("/api/connections")) return { status: 200, json: { connections: [{ platform: "linkedin", needs: "text" }, { platform: "bluesky", needs: "text" }, { platform: "bluesky", needs: "text" }, { platform: "instagram", needs: "photo_or_video" }] } };
      return { status: 200, json: { results: [{ platform: "linkedin", ok: true, url: "https://www.linkedin.com/feed/update/1" }, { platform: "bluesky", ok: false, error: "rate limited" }], held_message: "Held: free plan sends to 2 networks.", upgrade: { url: "https://postwire.io/pricing" } } };
    },
  };
  const module = { exports: {} };
  new Function("require", "module", "exports", "createFragment", src)((n) => api, module, module.exports, window.createFragment);
  const Plugin = module.exports, h = Plugin.helpers, r = {};
  r.text = h.noteText("---\ntitle: x\ntags: [a]\n---\n# Heading\n\nSome **bold** [[Note|alias]] and [[Plain]] ![[img.png]] [site](https://a.b/c)\n\n\n\nEnd");
  const p = new Plugin(); await p.onload();
  const ed = (sel, val) => ({ getSelection: () => sel, getValue: () => val });
  p.cmds[0].editorCallback(ed("", "hello")); r.noKey = notices.at(-1);
  p.settings.apiKey = "k_test";
  p.cmds[0].editorCallback(ed("", "---\na: 1\n---\n")); r.empty = notices.at(-1);
  mode = "badkey"; p.share(ed("picked text", "whole note")); await new Promise((s) => setTimeout(s, 50));
  r.badKey = document.body.lastElementChild.innerText; document.body.lastElementChild.remove(); mode = "ok";
  p.share(ed("picked text", "whole note")); await new Promise((s) => setTimeout(s, 50));
  const m = document.body.lastElementChild;
  r.prefill = m.querySelector("textarea").value;
  r.boxes = [...m.querySelectorAll("input")].map((b) => `${b.value}:${b.checked}:${b.disabled}`);
  r.button = m.querySelector("button").textContent;
  m.querySelector("button").click(); await new Promise((s) => setTimeout(s, 50));
  r.post = calls.at(-1); r.result = m.querySelector(".postwire-result").innerText; r.saved = p._data.picked; r.links = [...m.querySelectorAll(".postwire-result a")].map((a) => a.href);
  return r;
}, src);
const eq = (a, b, n) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.error("FAIL", n, JSON.stringify(a)); process.exitCode = 1; } };
eq(out.text, "Heading\n\nSome bold alias and Plain  site https://a.b/c\n\nEnd", "noteText");
eq(out.noKey, "Add your PostWire API key in this plugin's settings first.", "noKey");
eq(out.empty, "This note is empty.", "empty");
eq(/did not work/.test(out.badKey), true, "badKey");
eq(out.prefill, "picked text", "prefill");
eq(out.boxes, ["linkedin:true:false", "bluesky:true:false", "instagram:false:true"], "boxes");
eq(out.button, "Post to 2 networks", "button");
eq(out.post.body, { platforms: ["linkedin", "bluesky"], text: "picked text" }, "post body");
eq([out.post.url, out.post.method, out.post.headers.Authorization, out.post.headers["X-PostWire-Source"]], ["https://postwire.io/api/post", "POST", "Bearer k_test", "obsidian"], "post request");
eq(out.saved, ["linkedin", "bluesky"], "saved");
eq(out.links, ["https://www.linkedin.com/feed/update/1", "https://postwire.io/pricing"], "links");
eq(/Posted to LinkedIn/.test(out.result) && /Bluesky: rate limited/.test(out.result) && /Held:/.test(out.result), true, "result text");
await page.screenshot({ path: new URL("./modal.png", import.meta.url).pathname.slice(1) });
await browser.close();
console.log(process.exitCode ? "plugin FAILED" : "plugin OK");
