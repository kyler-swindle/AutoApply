const $ = (id) => document.getElementById(id);
let lastScanData = null;

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function injectContentScript(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ["content.js"]
    });
    return Array.isArray(results) ? results : [];
  } catch (err) {
    // Restricted Chrome pages / store pages are expected to reject injection.
    if (String(err?.message || "").includes("Cannot access")) return [];
    throw err;
  }
}

async function getWebNavigationFrames(tabId) {
  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    return Array.isArray(frames) ? frames : [];
  } catch (_err) {
    return [];
  }
}

function mergeFrameLists(injectionResults, webNavigationFrames) {
  const byId = new Map();

  for (const frame of webNavigationFrames || []) {
    if (typeof frame.frameId !== "number") continue;
    byId.set(frame.frameId, {
      frameId: frame.frameId,
      url: frame.url || "",
      source: "webNavigation"
    });
  }

  for (const result of injectionResults || []) {
    if (typeof result.frameId !== "number") continue;
    const existing = byId.get(result.frameId) || {};
    byId.set(result.frameId, {
      frameId: result.frameId,
      url: existing.url || result.documentUrl || "",
      source: existing.source ? `${existing.source}+scripting` : "scripting"
    });
  }

  if (!byId.has(0)) byId.set(0, { frameId: 0, url: "", source: "fallback-top" });
  return Array.from(byId.values()).sort((a, b) => a.frameId - b.frameId);
}

async function sendToFrame(tabId, frameId, type, payload = {}) {
  return chrome.tabs.sendMessage(
    tabId,
    { source: "autoapply-popup", type, ...payload },
    { frameId }
  );
}

async function sendToPage(type, payload = {}) {
  const tab = await getActiveTab();
  if (!tab?.id) throw new Error("No active tab found.");

  const injectionResults = await injectContentScript(tab.id);
  // Give newly injected content scripts a moment to register their listeners, especially in embedded app frames.
  await new Promise(resolve => setTimeout(resolve, 180));

  const webNavigationFrames = await getWebNavigationFrames(tab.id);
  const frames = mergeFrameLists(injectionResults, webNavigationFrames);
  const responses = [];
  const errors = [];

  for (const frame of frames) {
    try {
      const response = await sendToFrame(tab.id, frame.frameId, type, payload);
      if (response?.ok) {
        responses.push({ frame, response });
      } else if (response?.error) {
        errors.push(`${frame.url || `frame ${frame.frameId}`}: ${response.error}`);
      }
    } catch (err) {
      // Cross-origin/restricted frames may not accept the content script. Keep scanning reachable frames.
      errors.push(`${frame.url || `frame ${frame.frameId}`}: ${err?.message || String(err)}`);
    }
  }

  if (responses.length === 0) {
    throw new Error(errors[0] || "No reachable frames responded.");
  }

  return aggregateResponses(type, responses, frames, errors);
}

function aggregateResponses(type, responses, frames, errors) {
  const detections = responses.map(x => x.response.data?.detection || x.response.data).filter(Boolean);
  const matches = responses.flatMap(x => (x.response.data?.matches || []).map(m => ({ ...m, frameUrl: x.frame.url || "" })));
  const unknowns = responses.flatMap(x => (x.response.data?.unknowns || []).map(u => ({ ...u, frameUrl: x.frame.url || "" })));
  const skipped = responses.flatMap(x => (x.response.data?.skipped || []).map(u => ({ ...u, frameUrl: x.frame.url || "" })));

  const main = detections[0] || {};
  const stats = mergeStats(detections.map(d => d.stats || {}));
  const score = Math.max(...detections.map(d => Number(d.score || 0)), 0);
  const fields = detections.reduce((sum, d) => sum + Number(d.fields || 0), 0);
  const forms = detections.reduce((sum, d) => sum + Number(d.forms || 0), 0);

  // Keep top-page iframe count if available, but also expose extension-level reachability.
  stats.totalFrames = frames.length;
  stats.respondingFrames = responses.length;
  stats.unreachableFrames = Math.max(0, frames.length - responses.length);
  stats.frameErrors = errors.length;
  stats.scriptingFrames = frames.filter(f => String(f.source || "").includes("scripting")).length;
  stats.webNavigationFrames = frames.filter(f => String(f.source || "").includes("webNavigation")).length;

  const detection = {
    ...main,
    isLikelyJobApplication: detections.some(d => d.isLikelyJobApplication) || score >= 6 || fields >= 3,
    score,
    forms,
    fields,
    stats
  };

  if (type === "DETECT") return { ok: true, data: detection };
  return { ok: true, data: { detection, matches, unknowns, skipped } };
}

async function repairStorage(reset = false) {
  const response = await chrome.runtime.sendMessage({
    source: "autoapply-popup",
    type: reset ? "RESET_DEFAULTS" : "REPAIR_STORAGE"
  });
  if (!response?.ok) throw new Error(response?.error || "Storage repair failed.");
  await loadState();
  const data = response.data || {};
  const source = data.source ? ` Source: ${data.source}.` : "";
  const mode = reset ? "Reloaded" : "Merged";
  setSyncNotice(`${mode} AutoApply data into chrome.storage.local.${source}`);
  return data;
}

async function showTopFrameBadge(text) {
  try {
    const tab = await getActiveTab();
    if (!tab?.id) return;
    await injectContentScript(tab.id);
    await chrome.tabs.sendMessage(
      tab.id,
      { source: "autoapply-popup", type: "SHOW_BADGE", text },
      { frameId: 0 }
    );
  } catch (_err) {
    // Non-fatal: popup status still reports the count.
  }
}

function filledCount(data) {
  return (data?.matches || []).filter(m => m.filled === true).length;
}

function mergeStats(items) {
  const out = {};
  for (const stats of items) {
    for (const [key, value] of Object.entries(stats || {})) {
      out[key] = (out[key] || 0) + (Number(value) || 0);
    }
  }
  return out;
}

function setStatus(text, cls = "") {
  const status = $("status");
  status.textContent = text;
  status.className = cls;
}

function setAddRuleNotice(text = "") {
  const notice = $("addRuleNotice");
  if (!notice) return;
  notice.textContent = text;
  notice.className = text ? "notice show" : "notice";
}

function setSyncNotice(text = "") {
  const notice = $("syncNotice");
  if (!notice) return;
  notice.textContent = text;
  notice.className = text ? "notice show" : "notice";
}

function setResumeStatus(text = "") {
  const node = $("resumeStatus");
  if (!node) return;
  node.textContent = text;
}

function renderSummary(data) {
  if (!data) return;
  const detection = data.detection || data;
  const stats = detection.stats || {};
  $("summary").innerHTML = `
    <div><strong>${detection.isLikelyJobApplication ? "Likely job application" : "Not clearly a job application"}</strong></div>
    <div class="small">Score: ${detection.score ?? "?"} · Forms: ${detection.forms ?? "?"} · Fillable fields: ${detection.fields ?? "?"}</div>
    <div class="small">Raw controls: ${stats.rawControls ?? "?"} · Inputs: ${stats.rawInputs ?? "?"} · Textareas: ${stats.rawTextareas ?? "?"} · Selects: ${stats.rawSelects ?? "?"} · Buttons: ${stats.rawButtons ?? "?"} · Custom: ${stats.rawCustomControls ?? "?"}</div>
    <div class="small">Shadow roots: ${stats.shadowRoots ?? "?"} · Iframes: ${stats.iframes ?? "?"} · Same-origin iframes: ${stats.sameOriginIframes ?? "?"}</div>
    <div class="small">Frames scanned: ${stats.respondingFrames ?? "?"}/${stats.totalFrames ?? "?"} · Unreachable: ${stats.unreachableFrames ?? "?"}</div>
    <div class="small">Frame sources: scripting ${stats.scriptingFrames ?? "?"} · webNavigation ${stats.webNavigationFrames ?? "?"}</div>
    <div class="small">${escapeHtml(detection.title || "")}</div>
  `;
}

function renderResults(data) {
  lastScanData = data || null;
  const results = $("results");
  if (!data) {
    results.innerHTML = "";
    return;
  }
  const matches = data.matches || [];
  const unknowns = data.unknowns || [];
  const skipped = data.skipped || [];
  results.innerHTML = `
    <div class="result-card">
      <span class="badge">Matched ${matches.length}</span>
      <span class="badge">Skipped ${skipped.length}</span>
      <span class="badge">Unknown ${unknowns.length}</span>
    </div>
    ${matches.slice(0, 24).map(m => `
      <div class="result-card">
        <div><strong>${escapeHtml(m.answerKey || "inline answer")}</strong> <span class="badge">${m.confidence}</span>${m.filled ? ` <span class="badge">filled</span>` : ""}</div>
        ${m.inferredKey && m.inferredKey !== m.answerKey ? `<div class="small">Inferred: ${escapeHtml(m.inferredKey)}</div>` : ""}
        <div class="small">${escapeHtml(m.label).slice(0, 260)}</div>
        <div>${escapeHtml(maskSensitive(m.answer))}</div>
        ${m.frameUrl ? `<div class="small">Frame: ${escapeHtml(m.frameUrl).slice(0, 140)}</div>` : ""}
      </div>
    `).join("")}
    ${unknowns.slice(0, 12).map((u, index) => `
      <div class="result-card">
        <div class="warn"><strong>Unknown question</strong></div>
        <div class="small">${escapeHtml(u.label).slice(0, 320)}</div>
        ${u.suggestedTags?.length ? `<div class="small">Suggested tags: ${escapeHtml(u.suggestedTags.join(", ")).slice(0, 220)}</div>` : ""}
        ${u.frameUrl ? `<div class="small">Frame: ${escapeHtml(u.frameUrl).slice(0, 140)}</div>` : ""}
        <button class="mini use-unknown-btn" data-unknown-index="${index}">Add rule from this</button>
      </div>
    `).join("")}
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function maskSensitive(value) {
  const text = String(value ?? "");
  if (text.length <= 90) return text;
  return `${text.slice(0, 90)}…`;
}

function suggestAnswerKey(text) {
  const n = String(text || "").toLowerCase();
  const known = [
    ["securityClearance", ["security clearance", "clearance", "secret clearance", "top secret"]],
    ["eligibleForClearance", ["eligible", "obtain clearance", "maintain clearance"]],
    ["currentSecurityClearance", ["currently", "active clearance", "hold clearance", "possess clearance"]],
    ["phone", ["phone", "telephone", "mobile", "tel-national", "number"]],
    ["phoneType", ["phone type", "phonetype"]],
    ["address", ["street address", "address required"]],
    ["addressType", ["address type"]],
    ["city", ["city"]],
    ["state", ["state", "province"]],
    ["zip", ["zip", "postal"]],
    ["country", ["country"]]
  ];
  for (const [key, tags] of known) {
    if (tags.some(tag => n.includes(tag))) return key;
  }
  return camelKeyFromText(text);
}

function camelKeyFromText(text) {
  const words = String(text || "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5);
  if (words.length === 0) return "customAnswer";
  return words.map((word, index) => {
    const lower = word.toLowerCase();
    return index === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
  }).join("");
}

function prefillUnknown(index) {
  const unknown = lastScanData?.unknowns?.[Number(index)];
  if (!unknown) return;
  const tags = (unknown.suggestedTags?.length ? unknown.suggestedTags : unknown.label.split("|"))
    .map(x => String(x || "").trim())
    .filter(Boolean)
    .slice(0, 5);
  $("newTags").value = tags.join(", ");
  $("newAnswerKey").value = suggestAnswerKey(tags.join(" ") || unknown.label);
  $("newAnswer").value = "";
  $("addUnknownDetails").open = true;
  $("newAnswer").focus();
  setAddRuleNotice("");
  setStatus("Review/edit the suggested rule, add the answer, then click Add rule", "warn");
}

async function loadState() {
  const { autoApplyProfile, autoApplyAnswers, autoApplyResume } = await chrome.storage.local.get(["autoApplyProfile", "autoApplyAnswers", "autoApplyResume"]);
  $("profileJson").value = JSON.stringify(autoApplyProfile || {}, null, 2);
  $("answersJson").value = JSON.stringify(autoApplyAnswers || [], null, 2);
  if (autoApplyResume?.name) {
    const sizeKb = Math.round((autoApplyResume.size || 0) / 1024);
    setResumeStatus(`Stored resume: ${autoApplyResume.name} (${sizeKb} KB)`);
  } else {
    setResumeStatus("No resume stored yet.");
  }
}

async function saveProfile() {
  const profile = JSON.parse($("profileJson").value);
  await chrome.storage.local.set({ autoApplyProfile: profile });
  setStatus("Profile saved", "ok");
}

async function saveAnswers() {
  const answers = JSON.parse($("answersJson").value);
  if (!Array.isArray(answers)) throw new Error("Question rules must be a JSON array.");
  await chrome.storage.local.set({ autoApplyAnswers: answers });
  setStatus("Question rules saved", "ok");
}

async function exportData() {
  const state = await chrome.storage.local.get(["autoApplyProfile", "autoApplyAnswers", "autoApplySettings", "autoApplyResume"]);
  const payload = {
    schema: "autoapply.userData.v1",
    exportedAt: new Date().toISOString(),
    autoApplyProfile: state.autoApplyProfile || {},
    autoApplyAnswers: Array.isArray(state.autoApplyAnswers) ? state.autoApplyAnswers : [],
    autoApplySettings: state.autoApplySettings || {},
    autoApplyResume: state.autoApplyResume || null
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `autoapply_user_data_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setSyncNotice("Exported current browser-side profile/rules/resume data. Commit this JSON manually or import it later.");
  setStatus("Exported AutoApply user data", "ok");
}

function importDataFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read import file."));
    reader.onload = () => {
      try { resolve(JSON.parse(String(reader.result || "{}"))); }
      catch (err) { reject(new Error(`Invalid JSON import: ${err.message}`)); }
    };
    reader.readAsText(file);
  });
}

async function applyImportedData(payload) {
  if (!payload || typeof payload !== "object") throw new Error("Import must be a JSON object.");
  const patch = {};
  if (payload.autoApplyProfile && typeof payload.autoApplyProfile === "object") patch.autoApplyProfile = payload.autoApplyProfile;
  if (Array.isArray(payload.autoApplyAnswers)) patch.autoApplyAnswers = payload.autoApplyAnswers;
  if (payload.autoApplySettings && typeof payload.autoApplySettings === "object") patch.autoApplySettings = payload.autoApplySettings;
  if (payload.autoApplyResume === null) patch.autoApplyResume = null;
  else if (payload.autoApplyResume && typeof payload.autoApplyResume === "object") patch.autoApplyResume = payload.autoApplyResume;

  // Also accept direct raw exports of only profile/rules.
  if (Object.keys(patch).length === 0) {
    if (Array.isArray(payload)) patch.autoApplyAnswers = payload;
    else patch.autoApplyProfile = payload;
  }

  await chrome.storage.local.set(patch);
  await loadState();
  setSyncNotice("Imported data into chrome.storage.local. Refresh the application tab before filling.");
  setStatus("Imported AutoApply data", "ok");
}

async function saveSelectedResume() {
  const input = $("resumeFileInput");
  const file = input?.files?.[0];
  if (!file) throw new Error("Choose a resume file first.");
  const maxBytes = 8 * 1024 * 1024;
  if (file.size > maxBytes) throw new Error("Resume file is too large for local extension storage. Keep it under 8 MB.");
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read resume file."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
  await chrome.storage.local.set({
    autoApplyResume: {
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
      lastModified: file.lastModified || 0,
      dataUrl
    }
  });
  await loadState();
  setSyncNotice("Resume stored in browser-side extension storage. Export user data if you want a local JSON backup.");
  setStatus("Resume saved locally for AutoApply", "ok");
}

async function clearStoredResume() {
  await chrome.storage.local.remove("autoApplyResume");
  const input = $("resumeFileInput");
  if (input) input.value = "";
  await loadState();
  setStatus("Stored resume cleared", "ok");
}

async function addRule() {
  const tags = $("newTags").value.split(",").map(x => x.trim()).filter(Boolean);
  const answerKey = $("newAnswerKey").value.trim();
  const answer = $("newAnswer").value.trim();
  if (tags.length === 0) throw new Error("Add at least one tag.");
  if (!answerKey && !answer) throw new Error("Add either a profile key or direct answer.");

  const state = await chrome.storage.local.get(["autoApplyProfile", "autoApplyAnswers"]);
  const profile = state.autoApplyProfile || {};
  const answers = Array.isArray(state.autoApplyAnswers) ? state.autoApplyAnswers : [];
  const rule = { tags };
  if (answerKey) {
    rule.answerKey = answerKey;
    if (answer && !Object.prototype.hasOwnProperty.call(profile, answerKey)) {
      profile[answerKey] = answer;
    }
  } else {
    rule.answer = answer;
  }
  answers.push(rule);
  await chrome.storage.local.set({ autoApplyProfile: profile, autoApplyAnswers: answers });
  await loadState();
  setAddRuleNotice(`Added rule${answerKey ? ` for ${answerKey}` : ""}. Scan/fill again to apply it.`);
  setSyncNotice("Browser-side rules changed. Click Export profile/rules JSON if you want to sync this back to your repo/local backup.");
  setStatus("Rule added — scan/fill again to apply it", "ok");
}

function bind(id, handler) {
  $(id).addEventListener("click", async () => {
    try {
      setStatus("Working…");
      await handler();
    } catch (err) {
      setStatus(err.message || String(err), "error");
    }
  });
}

bind("detectBtn", async () => {
  const response = await sendToPage("DETECT", { frameScoped: true });
  if (!response?.ok) throw new Error(response?.error || "Detect failed.");
  renderSummary(response.data);
  renderResults(null);
  setStatus("Detection complete", "ok");
});

bind("scanBtn", async () => {
  const response = await sendToPage("SCAN", { frameScoped: true });
  if (!response?.ok) throw new Error(response?.error || "Scan failed.");
  renderSummary(response.data);
  renderResults(response.data);
  setStatus("Scan complete", "ok");
});

bind("fillBtn", async () => {
  const response = await sendToPage("FILL", { frameScoped: true, suppressFrameBadges: true });
  if (!response?.ok) throw new Error(response?.error || "Fill failed.");
  renderSummary(response.data);
  renderResults(response.data);
  const count = filledCount(response.data);
  const message = `AutoApply filled ${count} field${count === 1 ? "" : "s"}. Review before submitting.`;
  await showTopFrameBadge(message);
  setStatus(message, "ok");
});

document.addEventListener("click", (event) => {
  const button = event.target.closest?.(".use-unknown-btn");
  if (!button) return;
  prefillUnknown(button.dataset.unknownIndex);
});

bind("saveProfileBtn", saveProfile);
bind("repairStorageBtn", async () => {
  const data = await repairStorage(false);
  setStatus(`Storage repaired/merged (${data.profileKeys} profile keys, ${data.answerRules} rules)`, "ok");
});
bind("resetDefaultsBtn", async () => {
  const data = await repairStorage(true);
  setStatus(`Rebuilt bundled defaults (${data.profileKeys} profile keys, ${data.answerRules} rules)`, "ok");
});
bind("saveAnswersBtn", async () => {
  await saveAnswers();
  setSyncNotice("Browser-side rules changed. Click Export profile/rules JSON if you want to sync this back to your repo/local backup.");
});
bind("exportDataBtn", exportData);
bind("importDataBtn", async () => {
  const input = $("importDataFile");
  input.value = "";
  input.click();
});
bind("saveResumeBtn", saveSelectedResume);
bind("clearResumeBtn", clearStoredResume);
bind("addRuleBtn", addRule);

$("importDataFile")?.addEventListener("change", async (event) => {
  try {
    const file = event.target.files?.[0];
    if (!file) return;
    setStatus("Importing…");
    const payload = await importDataFromFile(file);
    await applyImportedData(payload);
  } catch (err) {
    setStatus(err.message || String(err), "error");
  }
});

loadState().catch(err => setStatus(err.message || String(err), "error"));
