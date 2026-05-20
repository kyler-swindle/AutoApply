(() => {
  const AUTOAPPLY_CONTENT_SCRIPT_VERSION = "0.2.1";
  if (window.__AUTOAPPLY_CONTENT_SCRIPT_VERSION__ === AUTOAPPLY_CONTENT_SCRIPT_VERSION) return;
  window.__AUTOAPPLY_CONTENT_SCRIPT_VERSION__ = AUTOAPPLY_CONTENT_SCRIPT_VERSION;

  const HIGHLIGHT_CLASS = "autoapply-highlight";
  const UNKNOWN_CLASS = "autoapply-unknown";
  const STYLE_ID = "autoapply-style";

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .${HIGHLIGHT_CLASS} { outline: 2px solid #22c55e !important; box-shadow: 0 0 0 3px rgba(34,197,94,.2) !important; }
      .${UNKNOWN_CLASS} { outline: 2px solid #f59e0b !important; box-shadow: 0 0 0 3px rgba(245,158,11,.2) !important; }
      .autoapply-badge { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; padding: 10px 12px; background: #111827; color: white; border-radius: 10px; font: 12px system-ui, sans-serif; box-shadow: 0 8px 24px rgba(0,0,0,.22); max-width: 360px; }
    `;
    document.documentElement.appendChild(style);
  }

  function normalize(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .replace(/[“”]/g, '"')
      .trim()
      .toLowerCase();
  }

  function uniq(items) {
    return Array.from(new Set(items.map(x => String(x || "").trim()).filter(Boolean)));
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function rootsForScanning(rootDocument = document) {
    const roots = [rootDocument];
    const walker = rootDocument.createTreeWalker(rootDocument.documentElement, NodeFilter.SHOW_ELEMENT);
    let node = walker.currentNode;
    let shadowRootCount = 0;
    while (node) {
      if (node.shadowRoot) {
        roots.push(node.shadowRoot);
        shadowRootCount += 1;
      }
      node = walker.nextNode();
    }
    return { roots, shadowRootCount };
  }

  function queryDeep(selector, rootDocument = document) {
    const { roots } = rootsForScanning(rootDocument);
    const results = [];
    for (const root of roots) {
      try {
        results.push(...root.querySelectorAll(selector));
      } catch (_err) {
        // Ignore malformed/inaccessible subroots.
      }
    }
    return uniqElements(results);
  }

  function uniqElements(elements) {
    const seen = new Set();
    const out = [];
    for (const el of elements) {
      if (!el || seen.has(el)) continue;
      seen.add(el);
      out.push(el);
    }
    return out;
  }

  function isActuallyHidden(el) {
    if (!el || !(el instanceof Element)) return true;
    const attrHidden = el.hasAttribute("hidden") || el.getAttribute("aria-hidden") === "true";
    if (attrHidden) return true;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return true;
    const rect = el.getBoundingClientRect();
    // Many custom controls have a zero-size native input plus a visible wrapper.
    // Treat zero-size native radio/checkbox as scannable if its label/wrapper is visible.
    if (rect.width > 0 && rect.height > 0) return false;
    const label = el.closest("label") || el.parentElement;
    if (label instanceof HTMLElement) {
      const labelStyle = getComputedStyle(label);
      const labelRect = label.getBoundingClientRect();
      return labelStyle.display === "none" || labelStyle.visibility === "hidden" || labelRect.width === 0 || labelRect.height === 0;
    }
    return true;
  }

  function isFillable(el) {
    if (!el || !(el instanceof HTMLElement)) return false;
    if (isActuallyHidden(el)) return false;
    if (el.disabled || el.getAttribute("aria-disabled") === "true") return false;
    if (el.readOnly) return false;

    const tag = el.tagName.toLowerCase();
    const role = normalize(el.getAttribute("role"));
    const contentEditable = el.getAttribute("contenteditable");

    if (tag === "textarea" || tag === "select") return true;
    if (contentEditable === "true" || role === "textbox" || role === "combobox") return true;
    if (["checkbox", "radio", "switch"].includes(role)) return true;
    if (tag === "button" || role === "button") {
      const text = normalize(el.innerText || el.textContent || el.getAttribute("aria-label") || "");
      const attrs = normalize(attrIdentityText(el));
      return el.getAttribute("aria-haspopup") != null || el.getAttribute("aria-expanded") != null || /select|dropdown|prompt|combobox/.test(attrs) || /select one|make a selection|choose/.test(text);
    }
    if (el.getAttribute("aria-haspopup") != null || el.getAttribute("aria-expanded") != null) return true;
    if (/select|dropdown|prompt/.test(normalize(attrIdentityText(el)))) return true;

    if (tag !== "input") return false;
    const type = (el.getAttribute("type") || "text").toLowerCase();
    return [
      "text", "email", "tel", "url", "number", "date", "search", "password", "file",
      "checkbox", "radio"
    ].includes(type);
  }


  function compactVisibleText(el, maxLen = 1800) {
    const text = String(el?.innerText || el?.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text || text.length > maxLen) return "";
    return text;
  }

  function workdayQuestionText(el) {
    const chunks = [];
    let node = el instanceof Element ? el.parentElement : null;

    // Workday commonly renders a question as a div/article/group containing a visible
    // button that only says "Select One". The real label is in nearby container text.
    for (let i = 0; i < 7 && node; i += 1) {
      const text = compactVisibleText(node, 2200);
      const n = normalize(text);
      if (text && (
        /\bselect one\b/.test(n) ||
        /\* indicates a required field/.test(n) === false && /\b\d+\.\s/.test(n) ||
        /data-automation-id|formField/i.test(node.getAttribute?.("data-automation-id") || "")
      )) {
        chunks.push(text);
      }

      // Also look backward from the control's parent; Workday often places the prompt
      // immediately before the select trigger rather than in a native label.
      let sib = node.previousElementSibling;
      for (let j = 0; j < 4 && sib; j += 1) {
        const sibText = compactVisibleText(sib, 1600);
        if (sibText) chunks.push(sibText);
        sib = sib.previousElementSibling;
      }

      node = node.parentElement;
    }
    return uniq(chunks);
  }

  function nearbyText(el) {
    const chunks = [];
    const parent = el.parentElement;
    const grand = parent?.parentElement;
    const previous = el.previousElementSibling;
    const next = el.nextElementSibling;

    for (const candidate of [previous, next, parent, grand]) {
      if (!candidate) continue;
      const text = candidate.innerText || candidate.textContent || "";
      if (text && text.length < 700) chunks.push(text);
    }

    // Common job-app component patterns: question text in a preceding sibling/container.
    let container = el.closest("[data-automation-id], [data-testid], [class*='field'], [class*='question'], [class*='form'], li, section, div");
    for (let i = 0; i < 4 && container; i += 1) {
      const text = container.innerText || container.textContent || "";
      if (text && text.length < 900) chunks.push(text);
      container = container.parentElement?.closest?.("[data-automation-id], [data-testid], [class*='field'], [class*='question'], [class*='form'], li, section, div");
    }
    return chunks;
  }

  function labelFor(el) {
    const chunks = [];
    const root = el.getRootNode();
    const rootQuery = (selector) => {
      try { return root.querySelectorAll ? root.querySelectorAll(selector) : document.querySelectorAll(selector); }
      catch (_err) { return []; }
    };

    const id = el.getAttribute("id");
    const ariaLabel = el.getAttribute("aria-label");
    const ariaLabelledBy = el.getAttribute("aria-labelledby");
    const ariaDescribedBy = el.getAttribute("aria-describedby");
    const name = el.getAttribute("name");
    const placeholder = el.getAttribute("placeholder");
    const autocomplete = el.getAttribute("autocomplete");
    const title = el.getAttribute("title");
    const dataAutomationId = el.getAttribute("data-automation-id");
    const dataTestId = el.getAttribute("data-testid");

    if (ariaLabel) chunks.push(ariaLabel);
    for (const attr of [ariaLabelledBy, ariaDescribedBy]) {
      if (!attr) continue;
      attr.split(/\s+/).forEach(labelId => {
        let labelEl = null;
        try { labelEl = root.getElementById ? root.getElementById(labelId) : document.getElementById(labelId); } catch (_err) {}
        if (labelEl) chunks.push(labelEl.innerText || labelEl.textContent || "");
      });
    }
    if (id) {
      rootQuery(`label[for="${cssEscape(id)}"]`).forEach(label => chunks.push(label.innerText || label.textContent || ""));
    }
    const wrappingLabel = el.closest("label");
    if (wrappingLabel) chunks.push(wrappingLabel.innerText || wrappingLabel.textContent || "");

    chunks.push(...workdayQuestionText(el));
    chunks.push(...nearbyText(el));
    [placeholder, name, id, autocomplete, title, dataAutomationId, dataTestId].filter(Boolean).forEach(v => chunks.push(v));
    return uniq(chunks).join(" | ");
  }

  function scanStats() {
    const { shadowRootCount } = rootsForScanning(document);
    const rawInputs = queryDeep("input").length;
    const rawTextareas = queryDeep("textarea").length;
    const rawSelects = queryDeep("select").length;
    const rawButtons = queryDeep("button, [role='button']").length;
    const rawCustom = queryDeep("[contenteditable='true'], [role='textbox'], [role='combobox'], [role='checkbox'], [role='radio'], [role='switch'], [aria-haspopup], [aria-expanded], [data-automation-id*='select' i], [data-automation-id*='dropdown' i]").length;
    const iframes = Array.from(document.querySelectorAll("iframe"));
    const sameOriginIframes = iframes.filter(frame => {
      try { return !!frame.contentDocument; } catch (_err) { return false; }
    }).length;
    return {
      rawInputs,
      rawTextareas,
      rawSelects,
      rawCustomControls: rawCustom,
      rawButtons,
      rawControls: rawInputs + rawTextareas + rawSelects + rawButtons + rawCustom,
      shadowRoots: shadowRootCount,
      iframes: iframes.length,
      sameOriginIframes
    };
  }

  function allFillableFields(includeSameOriginIframes = true) {
    const selectors = [
      "input", "textarea", "select", "button",
      "[contenteditable='true']", "[role='textbox']", "[role='combobox']", "[role='button']",
      "[role='checkbox']", "[role='radio']", "[role='switch']",
      "[aria-haspopup]", "[aria-expanded]",
      "[data-automation-id*='select' i]", "[data-automation-id*='dropdown' i]",
      "[data-uxi-widget-type*='select' i]", "[tabindex][aria-label]"
    ].join(", ");
    const fields = queryDeep(selectors).filter(isFillable);

    // Same-origin iframes can be scanned from the top page when requested.
    // Popup-driven all-frame scans disable this to prevent duplicate results.
    if (includeSameOriginIframes) {
      for (const frame of Array.from(document.querySelectorAll("iframe"))) {
        try {
          if (!frame.contentDocument) continue;
          fields.push(...queryDeep(selectors, frame.contentDocument).filter(isFillable));
        } catch (_err) {}
      }
    }
    return uniqElements(fields);
  }

  function detectJobPage() {
    const url = normalize(location.href);
    const title = normalize(document.title);
    const bodyText = normalize(document.body?.innerText || "").slice(0, 30000);
    const signals = [
      "apply", "application", "job", "career", "careers", "position", "resume", "cover letter",
      "work authorization", "sponsorship", "equal employment", "voluntary self-identification",
      "applicant", "candidate", "employment", "submit application", "my information", "work experience"
    ];
    let score = 0;
    const haystack = `${url} ${title} ${bodyText}`;
    for (const signal of signals) {
      if (haystack.includes(signal)) score += 1;
    }
    const forms = queryDeep("form").length;
    const fields = allFillableFields(false).length;
    const stats = scanStats();
    if (forms > 0) score += 2;
    if (fields >= 6) score += 2;
    if (stats.rawControls >= 6) score += 1;
    return {
      isLikelyJobApplication: score >= 6,
      score,
      url: location.href,
      title: document.title || location.href,
      frameUrl: location.href,
      isTopFrame: window.top === window,
      forms,
      fields,
      stats
    };
  }

  function valueFromAnswerRule(rule, profile) {
    if (!rule) return "";
    if (rule.answerKey && Object.prototype.hasOwnProperty.call(profile, rule.answerKey)) {
      return profile[rule.answerKey] ?? "";
    }
    return rule.answer ?? "";
  }

  function shouldSkipRule(rule, value) {
    if (!rule) return false;
    if (rule.skip === true) return true;
    if (rule.skipIfBlank === true && normalize(value) === "") return true;
    return false;
  }

  function splitLabelParts(label) {
    return String(label || "")
      .split("|")
      .map(x => x.trim())
      .filter(Boolean);
  }

  function attrIdentityText(el) {
    return [
      el.getAttribute("name"),
      el.getAttribute("id"),
      el.getAttribute("autocomplete"),
      el.getAttribute("data-automation-id"),
      el.getAttribute("data-testid"),
      el.getAttribute("type"),
      el.getAttribute("role")
    ].filter(Boolean).join(" ");
  }

  function looksLikeOptionBlob(text) {
    const n = normalize(text);
    if (!n) return false;
    const optionSignals = [
      "make a selection", "results available", "use down and up arrow keys",
      "work home mobile other email", "work home other",
      "united states afghanistan", "usd $ eur", "yr. bw. da.",
      "yesno", "yes no", "select one", "no results"
    ];
    return optionSignals.some(sig => n.includes(sig));
  }

  function isRequiredMessage(text) {
    return /\*?\s*required\.?$/i.test(String(text || "").trim());
  }

  function compactFieldText(el, label) {
    const parts = splitLabelParts(label);
    const attrs = attrIdentityText(el);
    const ownParts = [];
    const contextParts = [];
    let primary = "";

    for (const part of parts) {
      const trimmed = String(part || "").trim();
      if (!trimmed) continue;
      const n = normalize(trimmed);
      contextParts.push(trimmed);

      // Skip dropdown option blobs and current-value blobs for identity matching.
      if (looksLikeOptionBlob(trimmed)) continue;

      // Prefer the first short, human label as the primary field identity.
      if (!primary && trimmed.length <= 120 && !isRequiredMessage(trimmed)) {
        primary = trimmed;
      }

      if (trimmed.length <= 120) ownParts.push(trimmed);
      if (ownParts.length >= 3) break;
    }

    if (!primary && ownParts.length) primary = ownParts[0];

    return {
      primary: normalize(primary),
      own: normalize([...ownParts, attrs].join(" | ")),
      context: normalize([...contextParts, attrs].join(" | ")),
      attrs: normalize(attrs)
    };
  }

  function isShortLabel(text, word) {
    const n = normalize(text).replace(/[*.]/g, " ").trim();
    return n === word || n === `${word} required` || n.startsWith(`${word} required`);
  }

  function ruleKey(rule) {
    return String(rule?.answerKey || "");
  }

  function isGeneratedWeakKey(key) {
    // Keys made from popup suggestions like "dropdownSelectWhatIsYour" are useful as custom answers,
    // but should never beat a field with a stronger inferred identity.
    return /^dropdownSelect|^whatIsYour|^selectAnOption|^makeASelection/i.test(String(key || ""));
  }

  function inferAnswerKeyForElement(el, label) {
    const { primary, own, context, attrs } = compactFieldText(el, label);
    const tag = el.tagName.toLowerCase();
    const role = normalize(el.getAttribute("role"));
    const isDropdown = tag === "select" || tag === "button" || role === "combobox" || role === "button" || el.getAttribute("aria-haspopup") != null || el.getAttribute("aria-expanded") != null || /dropdown|select|prompt/i.test(el.className || "") || /select|dropdown|prompt/i.test(attrs);

    const direct = `${primary} ${attrs}`;
    const full = `${own} ${context} ${attrs}`;
    const inPhoneGroup = /phones? \(|personprofilefields\.phone|phonetype|phonenumber|tel-national|\bphone\b|telephone/.test(full);
    const inAddressGroup = /addresses?\b|postal recommendations|personprofilefields\.(address|city|state|postal|country)|zip|postal|state\/province|country/.test(full);
    const inSalaryGroup = /desired salary|currency|amount \(numbers only\)|time frame|usd \$|yr\./.test(full);

    // Workday/Leidos-style application-question prompts. These often have a visible
    // trigger that says only "Select One", so infer from the nearby numbered prompt.
    const promptText = `${primary} ${own} ${context}`;
    if (/legally eligible for employment in the united states|employment eligibility/.test(promptText)) return "workAuthorization";
    if (/highest level of education|highest degree|diploma received/.test(promptText)) return "highestEducation";
    if (/currently working towards.*bachelors|currently working towards.*master/.test(promptText)) return "currentlyPursuingDegree";
    if (/active u\.s\. government security clearance|hold an active.*security clearance/.test(promptText)) return "currentSecurityClearance";
    if (/post-government employment certification|never been employed by the u\.s\. government|u\.s\. armed forces/.test(promptText)) return "postGovernmentEmploymentCertification";
    if (/past 24 months.*employee of the dod|serve as an official or employee of the dod|section 847/.test(promptText)) return "dodPast24Months";
    if (/non-us government official/.test(promptText) && /immediate family member|close personal relationship/.test(promptText)) return "nonUSGovernmentOfficialRelationship";
    if (/non-us government official/.test(promptText)) return "nonUSGovernmentOfficial";
    if (/willing to relocate/.test(promptText)) return "willingToRelocate";
    if (/contacted by email/.test(promptText)) return "emailConsent";
    if (/contacted by text\/sms|contacted by text|sms about this/.test(promptText)) return "smsConsent";
    if (/current or former military spouse|military spouse/.test(promptText)) return "militarySpouse";

    if (tag === "input" && normalize(el.getAttribute("type") || "") === "file" && /resume|cv|curriculum vitae|upload from my computer|upload.*resume|attach.*resume/.test(full)) return "resumeFile";

    // Attribute-level and exact-control identifiers must beat visible option text.
    if (/personprofilefields\.phonetype|phonetype/.test(attrs)) return "phoneType";
    if (/personprofilefields\.phonenumber|phonenumber|tel-national|\btel\b/.test(attrs)) return "phone";
    if (/personprofilefields\.firstname|first[_-]?name|given-name/.test(attrs)) return "firstName";
    if (/personprofilefields\.lastname|last[_-]?name|family-name/.test(attrs)) return "lastName";
    if (/personprofilefields\.email|\bemail\b|e-mail/.test(attrs)) return "email";

    if (/personprofilefields\.addresstype|addresstype/.test(attrs)) return "addressType";
    if (/personprofilefields\.address2|address2|addressline2/.test(attrs)) return "address2";
    if (/personprofilefields\.city|\bcity\b/.test(attrs)) return "city";
    if (/personprofilefields\.(zip|postal)|postalcode|zip|postal/.test(attrs)) return "zip";
    if (/personprofilefields\.country|\bcountry\b/.test(attrs)) return "country";
    if (/personprofilefields\.(state|province)|stateprovince|state|province/.test(attrs)) return "state";
    if (/personprofilefields\.address\b/.test(attrs)) return "address";

    // Salary subcontrols: currency/time-frame before generic salary amount.
    if (/currency/.test(primary + " " + own + " " + attrs) && inSalaryGroup && isDropdown) return "salaryCurrency";
    if (/time frame/.test(primary + " " + own + " " + attrs) && inSalaryGroup && isDropdown) return "salaryTimeFrame";
    if (/amount \(numbers only\)|salary amount|desired salary amount/.test(primary + " " + own + " " + attrs)) return "desiredSalary";
    if (/desired salary/.test(primary) && !isDropdown) return "desiredSalary";

    // Human label identity.
    if (/legal first name|given name|first name/.test(primary)) return "firstName";
    if (/legal last name|family name|last name|surname/.test(primary)) return "lastName";
    if (/^email\*?$|e-mail/.test(primary)) return "email";

    if (inPhoneGroup && isShortLabel(primary, "type")) return "phoneType";
    if (inPhoneGroup && isShortLabel(primary, "number")) return "phone";
    if (/phone number|telephone number|mobile number/.test(primary)) return "phone";

    if (/receive .*text message|careers updates via text|sms updates|text message/.test(primary)) return "smsUpdates";

    if (/address 2|address line 2|apt|apartment|suite/.test(primary + " " + attrs)) return "address2";
    if (inAddressGroup && isShortLabel(primary, "type")) return "addressType";
    if (/^city\*?$|city required/.test(primary)) return "city";
    if (/zip|postal code/.test(primary)) return "zip";
    if (/^country\*?$|country required/.test(primary)) return "country";
    if (/state\/province|^state\*?$|province/.test(primary)) return "state";
    if (/^address\*?$|address required|street address/.test(primary)) return "address";

    if (/active security clearance|currently possess.*clearance|possess.*active.*clearance|clearance.*currently possess/.test(primary + " " + own)) return "clearanceLevel";
    if (/clearance level|highest clearance|level of clearance/.test(primary + " " + own)) return "clearanceLevel";
    if (/eligible|able to obtain|ability to obtain|obtain and maintain/.test(primary + " " + own) && /clearance/.test(full)) return "eligibleForClearance";
    if (/security clearance|\bclearance\b|secret clearance|top secret|ts\/sci|public trust/.test(primary + " " + own)) return "securityClearance";

    if (/ever worked for peraton|worked for .*peraton|predecessor company/.test(primary + " " + own)) return "previousPeratonEmployment";
    if (/company for which you worked|if yes.*company|if no.*n\/a/.test(primary + " " + own)) return "previousPeratonCompany";
    if (/member of the military|employee of the federal|state or local government|past 5 years/.test(primary + " " + own)) return "militaryOrGovernmentEmployeePast5Years";

    if (isDropdown && /suffix|name suffix/.test(primary + " " + own)) return "suffix";
    return "";
  }

  function semanticHintsFor(el, label) {
    const { primary, own, context, attrs } = compactFieldText(el, label);
    const tag = el.tagName.toLowerCase();
    const role = normalize(el.getAttribute("role"));
    const type = normalize(el.getAttribute("type") || "");
    const hints = [];
    const inferred = inferAnswerKeyForElement(el, label);

    const keyToHints = {
      firstName: ["first name", "given name"],
      lastName: ["last name", "family name", "surname"],
      email: ["email"],
      phoneType: ["phone type"],
      phone: ["phone number", "telephone number", "mobile number"],
      smsUpdates: ["sms updates", "text message", "careers updates via text"],
      addressType: ["address type"],
      address: ["street address", "address required"],
      address2: ["address 2", "address line 2"],
      city: ["city"],
      zip: ["zip", "postal code"],
      country: ["country"],
      state: ["state", "province"],
      clearanceLevel: ["clearance level", "active security clearance"],
      securityClearance: ["security clearance", "clearance"],
      eligibleForClearance: ["eligible to obtain clearance"],
      desiredSalary: ["desired salary", "salary amount"],
      salaryCurrency: ["salary currency", "currency"],
      salaryTimeFrame: ["salary time frame", "time frame"],
      previousPeratonEmployment: ["worked for peraton", "previous peraton employment"],
      previousPeratonCompany: ["previous peraton company", "n/a"],
      militaryOrGovernmentEmployeePast5Years: ["military or government employee", "past 5 years"],
      postGovernmentEmploymentCertification: ["post-government employment certification", "u.s. government", "u.s. armed forces"],
      dodPast24Months: ["employee of the dod", "past 24 months", "section 847"],
      highestEducation: ["highest education", "highest degree"],
      currentlyPursuingDegree: ["currently working towards degree"],
      nonUSGovernmentOfficial: ["non-us government official"],
      nonUSGovernmentOfficialRelationship: ["non-us government official relationship"],
      willingToRelocate: ["willing to relocate"],
      emailConsent: ["contacted by email"],
      smsConsent: ["contacted by text/sms"],
      militarySpouse: ["military spouse"],
      resumeFile: ["resume", "cv", "upload resume"]
    };
    if (inferred && keyToHints[inferred]) hints.push(...keyToHints[inferred]);

    if (/clearance|secret|top secret|ts\/sci|public trust/.test(primary + " " + own + " " + attrs)) hints.push("security clearance", "clearance");
    if (tag === "select" || role === "combobox") hints.push("dropdown", "select");
    if (type === "tel" || attrs.includes("tel-national")) hints.push("phone number");
    if (/make a selection/.test(context) && tag !== "input") hints.push("dropdown");
    return uniq(hints);
  }

  function expandedLabelFor(el) {
    const label = labelFor(el);
    const hints = semanticHintsFor(el, label);
    const inferred = inferAnswerKeyForElement(el, label);
    const { primary, own, attrs } = compactFieldText(el, label);
    const compact = [inferred, ...hints, primary, own, attrs].filter(Boolean).join(" | ");
    return compact || label;
  }

  function ruleExcluded(label, rule) {
    const nLabel = normalize(label);
    const excludes = Array.isArray(rule.excludeTags) ? rule.excludeTags : [];
    return excludes.some(tag => {
      const nTag = normalize(tag);
      return nTag && nLabel.includes(nTag);
    });
  }

  function fieldKindForAnswerKey(key) {
    const map = {
      firstName: "text",
      lastName: "text",
      fullName: "text",
      email: "email",
      phone: "tel",
      phoneType: "select",
      smsUpdates: "select",
      addressType: "select",
      address: "text",
      address2: "text",
      city: "text",
      zip: "text",
      country: "select",
      state: "select",
      suffix: "select",
      clearanceLevel: "select",
      securityClearance: "select",
      currentSecurityClearance: "select",
      eligibleForClearance: "select",
      desiredSalary: "number",
      salaryCurrency: "select",
      salaryTimeFrame: "select",
      previousPeratonEmployment: "select",
      previousPeratonCompany: "select",
      militaryOrGovernmentEmployeePast5Years: "select",
      militaryMemberStatus: "select",
      postGovernmentEmploymentCertification: "select",
      dodPast24Months: "select",
      highestEducation: "select",
      currentlyPursuingDegree: "select",
      nonUSGovernmentOfficial: "select",
      nonUSGovernmentOfficialRelationship: "select",
      willingToRelocate: "select",
      emailConsent: "select",
      smsConsent: "select",
      militarySpouse: "select",
      resumeFile: "file"
    };
    return map[key] || "";
  }

  function elementKind(el) {
    const tag = el.tagName.toLowerCase();
    const role = normalize(el.getAttribute("role"));
    const type = normalize(el.getAttribute("type") || "text");
    if (tag === "select" || tag === "button" || role === "combobox" || role === "button" || el.getAttribute("aria-haspopup") != null || el.getAttribute("aria-expanded") != null || /dropdown|select|prompt/i.test(el.className || "") || /select|dropdown|prompt/i.test(normalize(attrIdentityText(el)))) return "select";
    if (type === "file") return "file";
    if (type === "email") return "email";
    if (type === "tel") return "tel";
    if (type === "number") return "number";
    if (type === "checkbox" || role === "checkbox" || role === "switch") return "checkbox";
    if (type === "radio" || role === "radio") return "radio";
    return "text";
  }

  function compatibleFieldKind(el, rule) {
    const key = ruleKey(rule);
    if (!key) return true;
    const expected = rule.fieldKind || fieldKindForAnswerKey(key);
    if (!expected) return true;
    const actual = elementKind(el);
    if (expected === actual) return true;
    if (expected === "text" && ["email", "tel", "number"].includes(actual)) return false;
    if (expected === "tel" && actual === "text") return true;
    if (expected === "email" && actual === "text") return true;
    if (expected === "number" && actual === "text") return true;
    if (expected === "select" && actual !== "select") return false;
    if (actual === "select" && !["select", "radio", "checkbox"].includes(expected)) return false;
    return false;
  }

  function scoreTagAgainstLabel(nLabel, nTag) {
    if (!nTag) return 0;
    if (nLabel === nTag) return 1;
    if (nLabel.startsWith(`${nTag} |`) || nLabel.includes(`| ${nTag} |`) || nLabel.endsWith(`| ${nTag}`)) return 0.98;
    if (nLabel.includes(nTag)) return Math.min(0.95, 0.58 + nTag.length / Math.max(nLabel.length, 1));

    const tagWords = nTag.split(" ").filter(Boolean);
    if (tagWords.length === 0) return 0;
    const labelWords = new Set(nLabel.split(/[^a-z0-9]+/).filter(Boolean));
    const hits = tagWords.filter(word => labelWords.has(word) || nLabel.includes(word)).length;
    const coverage = hits / tagWords.length;
    if (tagWords.length === 1 && nTag.length <= 5) return coverage * 0.42;
    return coverage * 0.68;
  }

  function scoreRule(label, rule, el = null, inferredKey = "") {
    if (ruleExcluded(label, rule)) return 0;
    if (el && !compatibleFieldKind(el, rule)) return 0;

    const key = ruleKey(rule);
    if (inferredKey && key === inferredKey) return 1;
    if (inferredKey && key && key !== inferredKey && fieldKindForAnswerKey(inferredKey)) {
      // A strong inferred key should prevent unrelated/default/custom rules from winning just because
      // section text contains words like Email, Address, Salary, Military, or Government.
      // Generated/custom keys may not exist in fieldKindForAnswerKey(), so block them too.
      return 0;
    }

    const nLabel = normalize(label);
    const tags = Array.isArray(rule.tags) ? rule.tags : [];
    let best = 0;
    for (const tag of tags) {
      best = Math.max(best, scoreTagAgainstLabel(nLabel, normalize(tag)));
    }
    if (key) {
      const keyText = key.replace(/([a-z])([A-Z])/g, "$1 $2");
      best = Math.max(best, scoreTagAgainstLabel(nLabel, normalize(keyText)) * 0.94);
    }
    if (isGeneratedWeakKey(key)) best = Math.min(best, 0.55);
    if (typeof rule.priority === "number") best = Math.min(1, Math.max(0, best + rule.priority));
    return best;
  }

  function bestAnswer(label, answers, profile, threshold, inferredKey = "", el = null) {
    if (inferredKey) {
      const forcedRule = answers.find(rule => rule.answerKey === inferredKey);
      if (forcedRule) {
        const value = valueFromAnswerRule(forcedRule, profile);
        const forced = {
          rule: forcedRule,
          confidence: 0.99,
          value,
          skipped: shouldSkipRule(forcedRule, value)
        };
        if (forced.skipped) return forced;
        if (forced.value !== "" && forced.value != null) return forced;
      }
    }

    let best = null;
    for (const rule of answers) {
      const score = scoreRule(label, rule, el, inferredKey);
      if (!best || score > best.confidence) {
        const value = valueFromAnswerRule(rule, profile);
        best = {
          rule,
          confidence: score,
          value,
          skipped: shouldSkipRule(rule, value)
        };
      }
    }
    if (!best || best.confidence < threshold) return null;
    if (best.skipped) return best;
    if (best.value === "" || best.value == null) return null;
    return best;
  }

  function truthyAnswer(value) {
    const n = normalize(value);
    return ["yes", "true", "y", "1", "authorized", "i agree", "agree", "mobile", "work", "home"].includes(n);
  }

  function synonymTargets(value) {
    const raw = String(value ?? "").trim();
    const n = normalize(raw);
    const variants = new Set([raw, n]);
    const map = {
      "mobile": ["mobile", "cell", "cell phone"],
      "cell": ["mobile", "cell", "cell phone"],
      "work": ["work", "business"],
      "home": ["home", "personal"],
      "united states": ["united states", "united states of america", "usa", "us", "u.s.", "u.s.a."],
      "usa": ["united states", "united states of america", "usa", "us", "u.s.", "u.s.a."],
      "al": ["al", "alabama"],
      "yes": ["yes", "y", "true"],
      "no": ["no", "n", "false"],
      "none": ["none", "no clearance", "not applicable", "n/a"],
      "n/a": ["n/a", "na", "not applicable", "none"],
      "yr.": ["yr.", "yr", "year", "yearly", "annual", "annually"],
      "yr": ["yr.", "yr", "year", "yearly", "annual", "annually"],
      "usd $": ["usd $", "usd", "us dollar", "u.s. dollar"]
    };
    for (const item of map[n] || []) variants.add(item);
    return Array.from(variants).map(normalize).filter(Boolean);
  }

  function findBestNativeOption(options, value) {
    const targets = synonymTargets(value);
    const usable = options.filter(opt => !opt.disabled);
    const normalized = usable.map(opt => ({
      opt,
      text: normalize(opt.textContent),
      value: normalize(opt.value),
      label: normalize(opt.label)
    }));

    for (const target of targets) {
      const exact = normalized.find(x => x.text === target || x.value === target || x.label === target);
      if (exact) return exact.opt;
    }
    for (const target of targets) {
      const contains = normalized.find(x =>
        (x.text && (x.text.includes(target) || target.includes(x.text))) ||
        (x.value && (x.value.includes(target) || target.includes(x.value))) ||
        (x.label && (x.label.includes(target) || target.includes(x.label)))
      );
      if (contains) return contains.opt;
    }
    return null;
  }

  function visibleText(el) {
    return normalize(el?.innerText || el?.textContent || el?.getAttribute?.("aria-label") || el?.getAttribute?.("title") || "");
  }

  function dispatchRichInputEvents(el) {
    for (const type of ["input", "change", "blur"]) {
      el.dispatchEvent(new Event(type, { bubbles: true }));
    }
  }

  function clickElement(el) {
    if (!el) return false;
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
    el.click?.();
    return true;
  }

  function currencyOptionScore(text, valueAttr, value) {
    const desired = normalize(value);
    if (!/usd|eur|cad|mxn|gbp|cny|inr|jpy|ngn|zar|sgd|hkd|aud/.test(desired)) return 0;
    const t = normalize(text);
    const v = normalize(valueAttr);
    const codeMatch = desired.match(/\b[a-z]{3}\b/);
    const code = codeMatch ? codeMatch[0] : desired.slice(0, 3);
    if (!code) return 0;
    if (t === desired || v === desired) return 200;
    if (t === code || v === code) return 190;
    if (t.startsWith(`${code} `) || v.startsWith(`${code} `)) return 180;
    return 0;
  }

  function findOpenDropdownOption(value, answerKey = "") {
    const targets = synonymTargets(value);
    const optionSelectors = [
      "[role='option']",
      "[role='menuitem']",
      "li[role='option']",
      "li[data-value]",
      "[data-value]",
      "[data-automation-id*='option' i]",
      "[data-automation-id*='promptOption' i]",
      "[data-automation-id*='prompt' i]",
      "[class*='option' i]",
      "[class*='menuItem' i]"
    ].join(", ");

    const scored = queryDeep(optionSelectors)
      .filter(el => !isActuallyHidden(el))
      .map(el => {
        const text = visibleText(el);
        const valueAttr = normalize(el.getAttribute?.("data-value") || el.getAttribute?.("value") || "");
        if (!text && !valueAttr) return null;
        if (text.length > 120 || looksLikeOptionBlob(text)) return null;
        if (/make a selection|results available|use down and up arrow keys/.test(text)) return null;

        let score = 0;
        if (answerKey === "salaryCurrency") {
          score = currencyOptionScore(text, valueAttr, value);
        } else {
          for (const target of targets) {
            if (text === target || valueAttr === target) score = Math.max(score, 100);
            else if (text.startsWith(target) || target.startsWith(text)) score = Math.max(score, 75 - Math.abs(text.length - target.length));
            else if (text.includes(target) || target.includes(text)) score = Math.max(score, 45 - Math.abs(text.length - target.length));
          }
        }
        if (score <= 0) return null;
        return { el, text, score };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || a.text.length - b.text.length);

    return scored[0]?.el || null;
  }

  async function fillCustomDropdown(el, value, answerKey = "") {
    if (!value && value !== 0) return false;
    clickElement(el);
    await new Promise(resolve => setTimeout(resolve, 140));

    // Many custom combo boxes wrap a hidden/native input in a clickable parent.
    let option = findOpenDropdownOption(value, answerKey);
    if (option) {
      clickElement(option);
      dispatchRichInputEvents(el);
      return true;
    }

    // Searchable combo box fallback: type the target value, then pick the matching option.
    if (el instanceof HTMLInputElement || el.getAttribute("contenteditable") === "true" || normalize(el.getAttribute("role")) === "textbox" || normalize(el.getAttribute("role")) === "combobox") {
      if (el.getAttribute("contenteditable") === "true") el.textContent = String(value);
      else el.value = String(value);
      dispatchRichInputEvents(el);
      await new Promise(resolve => setTimeout(resolve, 160));
      option = findOpenDropdownOption(value, answerKey);
      if (option) {
        clickElement(option);
        dispatchRichInputEvents(el);
        return true;
      }
    }

    // Last attempt: click the closest visible combo wrapper and re-check options.
    const wrapper = el.closest("[role='combobox'], [aria-haspopup='listbox'], [class*='dropdown' i], [class*='select' i]") || el.parentElement;
    if (wrapper && wrapper !== el) {
      clickElement(wrapper);
      await new Promise(resolve => setTimeout(resolve, 140));
      option = findOpenDropdownOption(value, answerKey);
      if (option) {
        clickElement(option);
        dispatchRichInputEvents(el);
        return true;
      }
    }

    dispatchRichInputEvents(el);
    return false;
  }

  function fileFromStoredResume(resume) {
    if (!resume?.dataUrl || !resume?.name) return null;
    const [header, base64] = String(resume.dataUrl).split(",");
    if (!base64) return null;
    const mimeMatch = header.match(/data:([^;]+);base64/);
    const mime = resume.type || mimeMatch?.[1] || "application/octet-stream";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], resume.name, { type: mime, lastModified: resume.lastModified || Date.now() });
  }

  function fillResumeInput(el, resume) {
    if (!(el instanceof HTMLInputElement)) return false;
    if ((el.getAttribute("type") || "").toLowerCase() !== "file") return false;
    const file = fileFromStoredResume(resume);
    if (!file) return false;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    el.files = transfer.files;
    dispatchRichInputEvents(el);
    return el.files && el.files.length > 0;
  }

  async function fillElement(el, value, allowSelectFilling, answerKey = "") {
    const tag = el.tagName.toLowerCase();
    const role = normalize(el.getAttribute("role"));
    const stringValue = String(value);
    const inputType = (el.getAttribute("type") || "text").toLowerCase();

    if (inputType === "file") {
      return fillResumeInput(el, value);
    }

    if (tag === "select") {
      if (!allowSelectFilling) return false;
      const option = findBestNativeOption(Array.from(el.options || []), stringValue);
      if (!option) return false;
      el.value = option.value;
      dispatchRichInputEvents(el);
      return true;
    }

    if (tag === "button" || role === "button" || role === "combobox" || el.getAttribute("aria-haspopup") != null || el.getAttribute("aria-expanded") != null || /dropdown|select|prompt/i.test(el.className || "") || /select|dropdown|prompt/i.test(normalize(attrIdentityText(el)))) {
      if (!allowSelectFilling) return false;
      return await fillCustomDropdown(el, stringValue, answerKey);
    }

    if (inputType === "checkbox" || role === "checkbox" || role === "switch") {
      const shouldCheck = truthyAnswer(stringValue);
      if (el instanceof HTMLInputElement) el.checked = shouldCheck;
      else el.setAttribute("aria-checked", shouldCheck ? "true" : "false");
      dispatchRichInputEvents(el);
      return true;
    }

    if (inputType === "radio" || role === "radio") {
      const label = normalize(labelFor(el));
      const targets = synonymTargets(stringValue);
      if (!targets.some(target => label.includes(target))) return false;
      if (el instanceof HTMLInputElement) el.checked = true;
      else el.setAttribute("aria-checked", "true");
      clickElement(el);
      dispatchRichInputEvents(el);
      return true;
    }

    if (el.getAttribute("contenteditable") === "true") {
      el.textContent = stringValue;
      dispatchRichInputEvents(el);
      return true;
    }

    el.value = stringValue;
    dispatchRichInputEvents(el);
    return true;
  }

  async function scan({ fill = false, clearHighlights = true } = {}) {
    ensureStyle();
    if (clearHighlights) {
      queryDeep(`.${HIGHLIGHT_CLASS}, .${UNKNOWN_CLASS}`).forEach(el => {
        el.classList.remove(HIGHLIGHT_CLASS, UNKNOWN_CLASS);
      });
    }

    const { autoApplyProfile, autoApplyAnswers, autoApplySettings, autoApplyResume } = await chrome.storage.local.get(["autoApplyProfile", "autoApplyAnswers", "autoApplySettings", "autoApplyResume"]);
    const profile = autoApplyProfile || {};
    const answers = Array.isArray(autoApplyAnswers) ? autoApplyAnswers : [];
    const settings = autoApplySettings || {};
    const threshold = Number(settings.confidenceThreshold ?? 0.62);
    const matches = [];
    const unknowns = [];
    const skipped = [];
    const processed = new WeakSet();

    const processField = async (el) => {
      if (!el || processed.has(el)) return;
      processed.add(el);

      const label = labelFor(el);
      const matchLabel = expandedLabelFor(el);
      const inferredKey = inferAnswerKeyForElement(el, label);

      if (inferredKey === "resumeFile") {
        if (!autoApplyResume?.dataUrl) {
          skipped.push({
            label,
            tag: el.tagName.toLowerCase(),
            role: el.getAttribute("role") || "",
            type: el.getAttribute("type") || "",
            name: el.getAttribute("name") || "",
            id: el.getAttribute("id") || "",
            inferredKey,
            answerKey: "resumeFile",
            confidence: 0.99
          });
          return;
        }
        el.classList.add(HIGHLIGHT_CLASS);
        const didFill = fill ? fillResumeInput(el, autoApplyResume) : false;
        matches.push({
          label,
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute("role") || "",
          type: el.getAttribute("type") || "",
          name: el.getAttribute("name") || "",
          id: el.getAttribute("id") || "",
          inferredKey,
          answerKey: "resumeFile",
          answer: autoApplyResume.name || "stored resume",
          confidence: 0.99,
          filled: didFill
        });
        return;
      }

      const match = bestAnswer(matchLabel, answers, profile, threshold, inferredKey, el);
      if (match?.skipped) {
        skipped.push({
          label,
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute("role") || "",
          type: el.getAttribute("type") || "",
          name: el.getAttribute("name") || "",
          id: el.getAttribute("id") || "",
          inferredKey,
          answerKey: match.rule.answerKey || "",
          confidence: Number(match.confidence.toFixed(2))
        });
        return;
      }

      if (match) {
        el.classList.add(HIGHLIGHT_CLASS);
        const didFill = fill ? await fillElement(el, match.value, settings.allowSelectFilling !== false, match.rule.answerKey || inferredKey) : false;
        matches.push({
          label,
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute("role") || "",
          type: el.getAttribute("type") || "",
          name: el.getAttribute("name") || "",
          id: el.getAttribute("id") || "",
          inferredKey,
          answerKey: match.rule.answerKey || "",
          answer: String(match.value),
          confidence: Number(match.confidence.toFixed(2)),
          filled: didFill
        });
      } else {
        el.classList.add(UNKNOWN_CLASS);
        unknowns.push({
          label,
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute("role") || "",
          type: el.getAttribute("type") || "",
          name: el.getAttribute("name") || "",
          id: el.getAttribute("id") || "",
          inferredKey,
          suggestedTags: uniq([
            ...semanticHintsFor(el, label),
            ...label.split("|").map(x => x.trim()).filter(Boolean)
          ]).slice(0, 5)
        });
      }
    };

    for (const el of allFillableFields(false)) {
      await processField(el);
    }

    // Some app platforms enable dependent fields only after a dropdown changes
    // (for example, State/Province after Country). Do one short second pass on fill.
    if (fill) {
      await new Promise(resolve => setTimeout(resolve, 450));
      for (const el of allFillableFields(false)) {
        await processField(el);
      }
    }

    return { detection: detectJobPage(), matches, unknowns, skipped };
  }

  function showBadge(text) {
    let badge = document.querySelector(".autoapply-badge");
    if (!badge) {
      badge = document.createElement("div");
      badge.className = "autoapply-badge";
      document.body.appendChild(badge);
    }
    badge.textContent = text;
    window.setTimeout(() => badge.remove(), 3500);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.source !== "autoapply-popup") return false;

    if (message.type === "DETECT") {
      sendResponse({ ok: true, data: detectJobPage() });
      return false;
    }

    if (message.type === "SCAN") {
      scan({ fill: false }).then(data => sendResponse({ ok: true, data })).catch(err => sendResponse({ ok: false, error: err.message }));
      return true;
    }

    if (message.type === "FILL") {
      scan({ fill: true }).then(data => {
        if (!message.suppressFrameBadges) {
          const count = data.matches.filter(m => m.filled).length;
          if (count > 0) showBadge(`AutoApply filled ${count} field(s). Review before submitting.`);
        }
        sendResponse({ ok: true, data });
      }).catch(err => sendResponse({ ok: false, error: err.message }));
      return true;
    }

    if (message.type === "SHOW_BADGE") {
      showBadge(message.text || "AutoApply fill complete. Review before submitting.");
      sendResponse({ ok: true });
      return false;
    }

    return false;
  });
})();
