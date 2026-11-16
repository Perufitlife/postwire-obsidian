"use strict";
const { Plugin, PluginSettingTab, Setting, Modal, Notice, requestUrl } = require("obsidian");

const SITE = "https://postwire.io";
const MAX_CHARS = 3000;
const NAMES = {
  linkedin: "LinkedIn", facebook: "Facebook", instagram: "Instagram", bluesky: "Bluesky", mastodon: "Mastodon",
  telegram: "Telegram", discord: "Discord", slack: "Slack", tiktok: "TikTok", youtube: "YouTube", threads: "Threads",
  x: "X", twitter: "X", nostr: "Nostr", wordpress: "WordPress", devto: "Dev.to", hashnode: "Hashnode", pinterest: "Pinterest",
};
const nameOf = (p) => NAMES[p] || String(p || "").replace(/^./, (c) => c.toUpperCase());

// Turn a note's Markdown into the plain text of a post: no frontmatter, embeds, wikilink brackets or heading marks.
function noteText(markdown) {
  return String(markdown || "")
    .replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?/, "")
    .replace(/!\[\[[^\]]*\]\]/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2")
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, "$1 $2")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_CHARS);
}

// One connection per network; `needs` says what the network refuses without (a picture or a video).
function networksOf(body) {
  const list = body && Array.isArray(body.connections) ? body.connections : [];
  const seen = new Map();
  for (const c of list) if (c && c.platform && !seen.has(c.platform)) seen.set(c.platform, { platform: c.platform, textOnly: !c.needs || c.needs === "text" });
  return [...seen.values()];
}

async function call(key, method, path, body) {
  try {
    const res = await requestUrl({
      url: SITE + path, method, throw: false,
      headers: { Authorization: `Bearer ${key}`, "X-PostWire-Source": "obsidian", "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = {};
    try { json = res.json || {}; } catch (e) { json = {}; }
    return { code: res.status, body: json };
  } catch (e) {
    return { code: 0, body: { error: "Could not reach PostWire. Check your connection." } };
  }
}

class ShareModal extends Modal {
  constructor(app, plugin, text) {
    super(app);
    this.plugin = plugin;
    this.text = text;
  }

  async onOpen() {
    const { contentEl } = this;
    this.titleEl.setText("Share to social media");
    const loading = contentEl.createEl("p", { text: "Loading your accounts…", cls: "postwire-note" });
    const conns = await call(this.plugin.settings.apiKey, "GET", "/api/connections");
    loading.remove();
    if (conns.code === 401 || conns.code === 403) {
      contentEl.createEl("p", { text: "That API key did not work. Copy it again from PostWire and paste it in this plugin's settings." });
      return;
    }
    if (conns.code !== 200) {
      contentEl.createEl("p", { text: conns.body.error || `PostWire answered HTTP ${conns.code}.` });
      return;
    }
    const nets = networksOf(conns.body);
    if (!nets.length) {
      const p = contentEl.createEl("p", { text: "No social accounts connected yet. " });
      p.createEl("a", { text: "Connect one in PostWire", href: `${SITE}/dashboard.html?from=obsidian_connect` });
      return;
    }

    this.area = contentEl.createEl("textarea", { cls: "postwire-text" });
    this.area.value = this.text;
    this.count = contentEl.createDiv({ cls: "postwire-row" });
    this.boxes = [];
    const wrap = contentEl.createDiv({ cls: "postwire-nets" });
    const before = this.plugin.settings.picked;
    for (const n of nets) {
      const label = wrap.createEl("label");
      const box = label.createEl("input", { type: "checkbox" });
      box.value = n.platform;
      box.disabled = !n.textOnly;
      box.checked = n.textOnly && (Array.isArray(before) ? before.includes(n.platform) : true);
      label.createSpan({ text: nameOf(n.platform) });
      if (!n.textOnly) { label.addClass("is-off"); label.setAttr("title", "Needs a picture or a video"); }
      box.addEventListener("change", () => this.refresh());
      this.boxes.push(box);
    }
    this.send = contentEl.createEl("button", { text: "Post now", cls: "mod-cta" });
    this.send.addEventListener("click", () => this.post());
    this.result = contentEl.createDiv({ cls: "postwire-result" });
    this.area.addEventListener("input", () => this.refresh());
    this.refresh();
    this.area.focus();
  }

  picked() {
    return this.boxes.filter((b) => b.checked && !b.disabled).map((b) => b.value);
  }

  refresh() {
    const n = this.area.value.trim().length;
    const picked = this.picked().length;
    this.count.setText(`${n} characters`);
    this.send.disabled = !n || !picked;
    this.send.setText(picked > 1 ? `Post to ${picked} networks` : "Post now");
  }

  async post() {
    const platforms = this.picked();
    this.send.disabled = true;
    this.send.setText("Posting…");
    this.result.empty();
    this.plugin.settings.picked = platforms;
    await this.plugin.saveSettings();
    const res = await call(this.plugin.settings.apiKey, "POST", "/api/post", { platforms, text: this.area.value.trim() });
    const b = res.body || {};
    for (const r of Array.isArray(b.results) ? b.results : []) {
      if (!r || !r.platform) continue;
      const line = this.result.createDiv({ cls: r.ok ? "postwire-ok" : "postwire-bad" });
      line.appendText(r.ok ? `Posted to ${nameOf(r.platform)}. ` : `${nameOf(r.platform)}: ${String(r.error || "not posted").slice(0, 160)}`);
      if (r.ok && /^https?:\/\//.test(r.url || "")) line.createEl("a", { text: "View", href: r.url });
    }
    const msg = [b.held_message, b.upgrade_message, b.message_for_user, b.error].find((m) => typeof m === "string" && m)
      || (res.code >= 400 || res.code === 0 ? `PostWire answered HTTP ${res.code}.` : "");
    if (msg) this.result.createEl("p", { text: msg, cls: "postwire-note" });
    if (b.upgrade && /^https:\/\/postwire\.io\//.test(b.upgrade.url || "")) this.result.createEl("a", { text: "See PostWire plans", href: b.upgrade.url });
    this.refresh();
  }

  onClose() {
    this.contentEl.empty();
  }
}

class PostWireSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    let stateText;
    const desc = createFragment((f) => {
      f.appendText("PostWire needs a free account. ");
      f.createEl("a", { text: "Open PostWire", href: `${SITE}/dashboard.html?from=obsidian_settings` });
      f.appendText(", connect your social accounts and copy your API key from its settings. ");
      stateText = f.createSpan({ text: this.plugin.settings.apiKey ? "A key is saved." : "No key saved yet." });
    });
    new Setting(containerEl)
      .setName("API key")
      .setDesc(desc)
      .addText((t) => {
        t.inputEl.type = "password";
        t.setPlaceholder(this.plugin.settings.apiKey ? "Saved (hidden)" : "Paste your key");
        t.onChange(async (v) => {
          const key = v.trim();
          if (!key) return;
          this.plugin.settings.apiKey = key;
          await this.plugin.saveSettings();
          stateText.setText("Key saved.");
        });
      })
      .addButton((b) => b.setButtonText("Check").onClick(async () => {
        if (!this.plugin.settings.apiKey) { new Notice("Paste your PostWire API key first."); return; }
        const r = await call(this.plugin.settings.apiKey, "GET", "/api/connections");
        if (r.code === 200) {
          const nets = networksOf(r.body).map((n) => nameOf(n.platform));
          new Notice(nets.length ? `Connected. You can post to: ${nets.join(", ")}.` : "Key works. No social accounts connected yet.");
        } else new Notice(r.code === 0 ? r.body.error : "That key did not work. Copy it again from PostWire.");
      }));
  }
}

class PostWirePlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({ apiKey: "", picked: null }, await this.loadData());
    this.addSettingTab(new PostWireSettingTab(this.app, this));
    this.addCommand({
      id: "share",
      name: "Share note or selection to social media",
      editorCallback: (editor) => this.share(editor),
    });
    this.registerEvent(this.app.workspace.on("editor-menu", (menu, editor) => {
      menu.addItem((item) => item.setTitle("Share to social media").setIcon("send").onClick(() => this.share(editor)));
    }));
  }

  share(editor) {
    if (!this.settings.apiKey) {
      new Notice("Add your PostWire API key in this plugin's settings first.");
      return;
    }
    const text = noteText(editor.getSelection() || editor.getValue());
    if (!text) { new Notice("This note is empty."); return; }
    new ShareModal(this.app, this, text).open();
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

PostWirePlugin.helpers = { noteText, networksOf, nameOf };
module.exports = PostWirePlugin;
