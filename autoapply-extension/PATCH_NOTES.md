# AutoApply sanitized repo package 0.2.1

This package is intended for a fresh clean repository after removing a previous repo that accidentally contained personal data.

## Main changes

- Sanitized bundled defaults in `background.js`.
- Kept the existing browser-side save workflow: **Repair/merge defaults** merges new bundled sample keys/rules without replacing existing local `chrome.storage.local` values.
- Changed reset wording to **Reset sample defaults** so it is clear reset uses fake/sample data.
- Added `samples/autoapply_user_data.sample.json` with fake importable data.
- Added `.gitignore` entries for exported user data, local JSON, resumes, private folders, and environment files.
- Kept the Workday/iCIMS detection/fill improvements from the latest local test build.

## Important

Do not commit exported real user data. Export/import is for local backup and transfer only.
