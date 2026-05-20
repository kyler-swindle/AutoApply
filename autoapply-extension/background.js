const defaultProfile = {
  firstName: "Alex",
  lastName: "Applicant",
  fullName: "Alex Applicant",
  suffix: "",
  email: "alex.applicant@example.com",
  phoneType: "Mobile",
  phone: "5550101234",
  smsUpdates: "No",
  addressType: "Home",
  address: "123 Main St",
  address2: "",
  city: "Sampleville",
  state: "AL",
  zip: "35000",
  country: "United States",
  linkedin: "linkedin.com/in/alex-applicant",
  github: "https://github.com/alex-applicant",
  portfolio: "",
  workAuthorization: "Yes",
  requireSponsorship: "No",
  currentSecurityClearance: "No",
  securityClearance: "None",
  clearanceLevel: "None",
  eligibleForClearance: "Yes",
  desiredSalary: "80000",
  salaryCurrency: "USD $",
  salaryTimeFrame: "Yr.",
  previousPeratonEmployment: "No",
  previousPeratonCompany: "N/A",
  militaryOrGovernmentEmployeePast5Years: "No",
  postGovernmentEmploymentCertification: "I have never been employed by the U.S. government or the U.S. Armed Forces.",
  dodPast24Months: "No",
  highestEducation: "Bachelor's Degree",
  currentlyPursuingDegree: "No",
  nonUSGovernmentOfficial: "No",
  nonUSGovernmentOfficialRelationship: "No",
  willingToRelocate: "Yes",
  emailConsent: "Yes",
  smsConsent: "No",
  militarySpouse: "No",
  availableStartDate: "",
  education: "B.S. Computer Science",
  school: "Sample University",
  graduationDate: "May 2026",
  gpa: "3.75",
  resumeText: "Paste resume text here for keyword matching."
};

const defaultAnswers = [
  { tags: ["first name", "given name"], answerKey: "firstName", fieldKind: "text" },
  { tags: ["last name", "surname", "family name"], answerKey: "lastName", fieldKind: "text" },
  { tags: ["full name", "legal name"], answerKey: "fullName", fieldKind: "text" },
  { tags: ["suffix", "name suffix"], answerKey: "suffix", fieldKind: "select", skipIfBlank: true },
  { tags: ["email", "e-mail"], answerKey: "email", fieldKind: "email" },
  { tags: ["phone type", "phones type", "phone type required", "personprofilefields phonetype", "phonetype"], answerKey: "phoneType", fieldKind: "select" },
  { tags: ["phone number", "telephone number", "mobile number", "number required", "personprofilefields phonenumber", "phonenumber", "tel-national", "phones number", "phone number required"], answerKey: "phone", fieldKind: "tel", excludeTags: ["address", "zip", "postal", "employee number", "social security"] },
  { tags: ["receive careers updates via text message", "receive updates via text message", "text message", "sms updates", "careers updates via text"], answerKey: "smsUpdates", fieldKind: "select" },
  { tags: ["address type", "addresses type", "address type required"], answerKey: "addressType", fieldKind: "select" },
  { tags: ["address", "street address", "address required"], answerKey: "address", fieldKind: "text", excludeTags: ["address 2", "city", "zip", "postal", "country", "state", "province"] },
  { tags: ["address 2", "address line 2", "apt", "apartment", "suite"], answerKey: "address2", fieldKind: "text", skipIfBlank: true },
  { tags: ["city", "city required"], answerKey: "city", fieldKind: "text", excludeTags: ["address", "zip", "postal", "country", "state", "province"] },
  { tags: ["zip", "postal code", "zip/postal code"], answerKey: "zip", fieldKind: "text", excludeTags: ["address", "city", "country", "state", "province"] },
  { tags: ["country"], answerKey: "country", fieldKind: "select", excludeTags: ["address", "city", "zip", "postal", "state", "province"] },
  { tags: ["state", "province", "state/province"], answerKey: "state", fieldKind: "select", excludeTags: ["address", "city", "zip", "postal", "country"] },
  { tags: ["linkedin", "linked in"], answerKey: "linkedin", fieldKind: "text" },
  { tags: ["github", "git hub"], answerKey: "github", fieldKind: "text" },
  { tags: ["portfolio", "website", "personal site"], answerKey: "portfolio", fieldKind: "text" },
  { tags: ["authorized to work", "work authorization", "eligible to work"], answerKey: "workAuthorization", fieldKind: "select" },
  { tags: ["sponsorship", "visa sponsorship", "require sponsorship"], answerKey: "requireSponsorship", fieldKind: "select" },
  { tags: ["current security clearance", "currently hold security clearance", "do you have a security clearance", "possess security clearance", "hold a clearance"], answerKey: "currentSecurityClearance", fieldKind: "select" },
  { tags: ["active security clearance", "currently possess clearance", "currently possess security clearance", "please specify active security clearance", "specify active security clearance", "clearance level", "level of clearance", "highest clearance"], answerKey: "clearanceLevel", fieldKind: "select" },
  { tags: ["security clearance", "clearance", "dod clearance", "secret clearance", "top secret", "public trust"], answerKey: "securityClearance", fieldKind: "select" },
  { tags: ["eligible to obtain clearance", "able to obtain clearance", "ability to obtain clearance", "obtain and maintain clearance", "eligible for security clearance"], answerKey: "eligibleForClearance", fieldKind: "select" },
  { tags: ["salary currency", "currency"], answerKey: "salaryCurrency", fieldKind: "select", excludeTags: ["military", "government", "peraton", "security clearance"] },
  { tags: ["desired salary", "salary amount", "amount numbers only", "amount (numbers only)"], answerKey: "desiredSalary", fieldKind: "number", excludeTags: ["currency", "time frame", "military", "government", "peraton"] },
  { tags: ["salary time frame", "time frame"], answerKey: "salaryTimeFrame", fieldKind: "select", excludeTags: ["military", "government", "peraton"] },
  { tags: ["have you ever worked for peraton", "worked for peraton", "peraton subsidiary", "predecessor company"], answerKey: "previousPeratonEmployment", fieldKind: "select" },
  { tags: ["company for which you worked", "if no please select n/a", "if no select n/a", "if yes indicate the company"], answerKey: "previousPeratonCompany", fieldKind: "select" },
  { tags: ["member of the military", "employee of the federal", "state or local government", "past 5 years"], answerKey: "militaryOrGovernmentEmployeePast5Years", fieldKind: "select" },
  { tags: ["post-government employment certification", "gc489", "never been employed by the u.s. government", "u.s. armed forces"], answerKey: "postGovernmentEmploymentCertification", fieldKind: "select" },
  { tags: ["employee of the dod", "official or employee of the dod", "past 24 months", "section 847", "national defense authorization act"], answerKey: "dodPast24Months", fieldKind: "select" },
  { tags: ["legally eligible for employment in the united states", "employment eligibility", "proof of identity and employment eligibility"], answerKey: "workAuthorization", fieldKind: "select" },
  { tags: ["highest level of education", "highest degree", "diploma received", "highest education"], answerKey: "highestEducation", fieldKind: "select" },
  { tags: ["currently working towards a bachelors", "currently working towards a master's", "working towards a bachelors or masters degree", "currently pursuing degree"], answerKey: "currentlyPursuingDegree", fieldKind: "select" },
  { tags: ["active u.s. government security clearance", "hold an active security clearance", "active government security clearance"], answerKey: "currentSecurityClearance", fieldKind: "select" },
  { tags: ["non-us government official", "non-u.s. government official", "non us government official"], answerKey: "nonUSGovernmentOfficial", fieldKind: "select", excludeTags: ["immediate family", "close personal relationship"] },
  { tags: ["immediate family member", "close personal relationship", "non-us government official relationship", "non-u.s. government official relationship"], answerKey: "nonUSGovernmentOfficialRelationship", fieldKind: "select" },
  { tags: ["willing to relocate", "relocate if required", "relocation"], answerKey: "willingToRelocate", fieldKind: "select" },
  { tags: ["contacted by email", "email about this or other opportunities", "email consent"], answerKey: "emailConsent", fieldKind: "select" },
  { tags: ["contacted by text/sms", "contacted by text", "sms about this or other opportunities", "sms consent"], answerKey: "smsConsent", fieldKind: "select" },
  { tags: ["current or former military spouse", "military spouse"], answerKey: "militarySpouse", fieldKind: "select" },
  { tags: ["start date", "available start", "availability"], answerKey: "availableStartDate", fieldKind: "text" },
  { tags: ["school", "university", "college"], answerKey: "school", fieldKind: "text" },
  { tags: ["degree", "education"], answerKey: "education", fieldKind: "text" },
  { tags: ["graduation", "graduation date"], answerKey: "graduationDate", fieldKind: "text" },
  { tags: ["gpa"], answerKey: "gpa", fieldKind: "text" }
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

async function repairStorage({ resetProfile = false, resetAnswers = false } = {}) {
  const existing = await chrome.storage.local.get(["autoApplyProfile", "autoApplyAnswers", "autoApplySettings"]);
  const existingProfile = resetProfile ? {} : (existing.autoApplyProfile || {});
  const existingAnswers = resetAnswers ? [] : (Array.isArray(existing.autoApplyAnswers) ? existing.autoApplyAnswers : []);
  const existingSettings = existing.autoApplySettings || {};

  const mergedProfile = resetProfile ? { ...defaultProfile } : mergeProfile(existingProfile, defaultProfile);
  const mergedAnswers = resetAnswers ? [...defaultAnswers] : mergeAnswerRules(existingAnswers, defaultAnswers);
  const mergedSettings = {
    safeMode: true,
    highlightOnly: true,
    allowSelectFilling: true,
    confidenceThreshold: 0.6,
    ...existingSettings
  };

  await chrome.storage.local.set({
    autoApplyProfile: mergedProfile,
    autoApplyAnswers: mergedAnswers,
    autoApplySettings: mergedSettings
  });

  return { profileKeys: Object.keys(mergedProfile).length, answerRules: mergedAnswers.length, resetProfile, resetAnswers };
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
    "postGovernmentEmploymentCertification",
    "dodPast24Months",
    "highestEducation",
    "currentlyPursuingDegree",
    "nonUSGovernmentOfficial",
    "nonUSGovernmentOfficialRelationship",
    "willingToRelocate",
    "emailConsent",
    "smsConsent",
    "militarySpouse"
  ];

  for (const key of replaceBlankWithDefault) {
    if (merged[key] === "" || merged[key] == null) merged[key] = defaultProfile[key];
  }
  return merged;
}

function mergeAnswerRules(existingRules, defaultRules) {
  const defaultByKey = new Map(defaultRules.map(rule => [rule.answerKey, rule]).filter(([key]) => Boolean(key)));
  const merged = [];
  const seenKeys = new Set();

  for (const rule of existingRules) {
    const key = rule?.answerKey || "";
    if (key && defaultByKey.has(key)) {
      // Replace older bundled rules with the current bundled version, but keep truly custom rules below.
      if (!seenKeys.has(key)) {
        merged.push(defaultByKey.get(key));
        seenKeys.add(key);
      }
      continue;
    }

    // Drop weak generated test keys that caused broad false positives, especially dropdownSelectWhatIsYour.
    if (/^dropdownSelect|^whatIsYour|^selectAnOption|^makeASelection/i.test(key)) continue;
    merged.push(rule);
    if (key) seenKeys.add(key);
  }

  for (const rule of defaultRules) {
    if (rule.answerKey && seenKeys.has(rule.answerKey)) continue;
    merged.push(rule);
    if (rule.answerKey) seenKeys.add(rule.answerKey);
  }

  return merged;
}

