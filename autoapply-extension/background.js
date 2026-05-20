const AUTOAPPLY_BACKGROUND_VERSION = "0.2.2";

const SAMPLE_DATA_PATH = "samples/autoapply_user_data.sample.json";
const LOCAL_DATA_PATHS = [
  "local/autoapply_user_data.local.json",
  "local/autoapply_user_data.json"
];

const FALLBACK_SETTINGS = {
  safeMode: true,
  highlightOnly: true,
  allowSelectFilling: true,
  confidenceThreshold: 0.6
};

// Keep only non-personal emergency fallback rules in code. Profile defaults are loaded
// from JSON files so real user profile data can live in gitignored local/ data.
const FALLBACK_ANSWERS = [
  { tags: ["first name", "given name"], answerKey: "firstName", fieldKind: "text" },
  { tags: ["last name", "surname", "family name"], answerKey: "lastName", fieldKind: "text" },
  { tags: ["full name", "legal name"], answerKey: "fullName", fieldKind: "text" },
  { tags: ["email", "e-mail"], answerKey: "email", fieldKind: "email" },
  { tags: ["phone number", "telephone number", "mobile number"], answerKey: "phone", fieldKind: "tel" },
  { tags: ["authorized to work", "work authorization", "eligible to work"], answerKey: "workAuthorization", fieldKind: "select" },
  { tags: ["sponsorship", "visa sponsorship", "require sponsorship"], answerKey: "requireSponsorship", fieldKind: "select" }
];

chrome.runtime.onInstalled.addListener(async () => {
  await repairStorage({ resetProfile: false, resetAnswers: false });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.source !== "autoapply-popup") return false;

  if (message.type === "REPAIR_STORAGE") {
    repairStorage({ resetProfile: false, resetAnswers: false })
      .then(data => sendResponse({ ok: true, data }))
      .catch(err => sendResponse({ ok: false, error: err.message || String(err) }));
    return true;
  }

  if (message.type === "RESET_DEFAULTS") {
    repairStorage({ resetProfile: true, resetAnswers: true })
      .then(data => sendResponse({ ok: true, data }))
      .catch(err => sendResponse({ ok: false, error: err.message || String(err) }));
    return true;
  }

  return false;
});

async function readExtensionJson(path) {
  const url = chrome.runtime.getURL(path);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path} not found (${response.status})`);
  const data = await response.json();
  if (!data || typeof data !== "object") throw new Error(`${path} did not contain a JSON object.`);
  return data;
}

async function readFirstAvailableJson(paths) {
  const errors = [];
  for (const path of paths) {
    try {
      const data = await readExtensionJson(path);
      return { path, data };
    } catch (err) {
      errors.push(`${path}: ${err.message || String(err)}`);
    }
  }
  return { path: "", data: null, errors };
}

async function loadDefaultBundle() {
  const sample = await readFirstAvailableJson([SAMPLE_DATA_PATH]);
  const local = await readFirstAvailableJson(LOCAL_DATA_PATHS);

  const sampleData = sample.data || {};
  const localData = local.data || {};

  const sampleProfile = objectOrEmpty(sampleData.autoApplyProfile);
  const localProfile = objectOrEmpty(localData.autoApplyProfile);

  const sampleAnswers = Array.isArray(sampleData.autoApplyAnswers) ? sampleData.autoApplyAnswers : FALLBACK_ANSWERS;
  const localAnswers = Array.isArray(localData.autoApplyAnswers) ? localData.autoApplyAnswers : [];

  const sampleSettings = { ...FALLBACK_SETTINGS, ...objectOrEmpty(sampleData.autoApplySettings) };
  const localSettings = objectOrEmpty(localData.autoApplySettings);

  return {
    profile: { ...sampleProfile, ...localProfile },
    answers: mergeAnswerRules(sampleAnswers, localAnswers),
    settings: { ...sampleSettings, ...localSettings },
    source: local.data ? local.path : (sample.data ? sample.path : "fallback-code"),
    sampleLoaded: Boolean(sample.data),
    localLoaded: Boolean(local.data),
    localErrors: local.errors || []
  };
}

async function repairStorage({ resetProfile = false, resetAnswers = false } = {}) {
  const defaults = await loadDefaultBundle();
  const existing = await chrome.storage.local.get(["autoApplyProfile", "autoApplyAnswers", "autoApplySettings"]);

  const existingProfile = resetProfile ? {} : objectOrEmpty(existing.autoApplyProfile);
  const existingAnswers = resetAnswers ? [] : (Array.isArray(existing.autoApplyAnswers) ? existing.autoApplyAnswers : []);
  const existingSettings = resetProfile ? {} : objectOrEmpty(existing.autoApplySettings);

  const mergedProfile = resetProfile ? { ...defaults.profile } : mergeProfile(existingProfile, defaults.profile);
  const mergedAnswers = resetAnswers ? [...defaults.answers] : mergeAnswerRules(existingAnswers, defaults.answers);
  const mergedSettings = {
    ...FALLBACK_SETTINGS,
    ...defaults.settings,
    ...existingSettings
  };

  await chrome.storage.local.set({
    autoApplyProfile: mergedProfile,
    autoApplyAnswers: mergedAnswers,
    autoApplySettings: mergedSettings
  });

  return {
    version: AUTOAPPLY_BACKGROUND_VERSION,
    source: defaults.source,
    sampleLoaded: defaults.sampleLoaded,
    localLoaded: defaults.localLoaded,
    profileKeys: Object.keys(mergedProfile).length,
    answerRules: mergedAnswers.length,
    resetProfile,
    resetAnswers
  };
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function mergeProfile(existingProfile, defaultProfile) {
  const merged = { ...defaultProfile, ...existingProfile };
  const replaceBlankWithDefault = [
    "previousPeratonEmployment",
    "previousPeratonCompany",
    "militaryOrGovernmentEmployeePast5Years",
    "salaryCurrency",
    "salaryTimeFrame",
    "clearanceLevel",
    "securityClearance",
    "workAuthorization",
    "requireSponsorship"
  ];

  for (const key of replaceBlankWithDefault) {
    if ((merged[key] === "" || merged[key] == null) && defaultProfile[key] != null) {
      merged[key] = defaultProfile[key];
    }
  }
  return merged;
}

function mergeAnswerRules(existingRules, defaultRules) {
  const defaultByKey = new Map((defaultRules || []).map(rule => [rule.answerKey, rule]).filter(([key]) => Boolean(key)));
  const merged = [];
  const seenKeys = new Set();
  const seenTagBundles = new Set();

  for (const rule of existingRules || []) {
    if (!rule || typeof rule !== "object") continue;
    const key = rule.answerKey || "";
    if (key && defaultByKey.has(key)) {
      if (!seenKeys.has(key)) {
        merged.push(defaultByKey.get(key));
        seenKeys.add(key);
      }
      continue;
    }

    if (/^dropdownSelect|^whatIsYour|^selectAnOption|^makeASelection/i.test(key)) continue;
    const tagBundle = tagsKey(rule.tags);
    if (!key && tagBundle && seenTagBundles.has(tagBundle)) continue;

    merged.push(rule);
    if (key) seenKeys.add(key);
    if (tagBundle) seenTagBundles.add(tagBundle);
  }

  for (const rule of defaultRules || []) {
    if (!rule || typeof rule !== "object") continue;
    const key = rule.answerKey || "";
    const tagBundle = tagsKey(rule.tags);
    if (key && seenKeys.has(key)) continue;
    if (!key && tagBundle && seenTagBundles.has(tagBundle)) continue;
    merged.push(rule);
    if (key) seenKeys.add(key);
    if (tagBundle) seenTagBundles.add(tagBundle);
  }

  return merged;
}

function tagsKey(tags) {
  if (!Array.isArray(tags)) return "";
  return tags.map(tag => String(tag || "").trim().toLowerCase()).filter(Boolean).sort().join("|");
}
