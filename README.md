# AutoApply Local Assistant

Local-only Chrome extension prototype for detecting job application pages, scanning fields, matching them against local profile/question-rule data, and filling matched answers after review.

## Local install

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder.
5. Open the extension popup on a job application page and use **Detect page**, **Scan fields**, then **Fill matched**.

## Privacy/dev workflow

The committed defaults are sample-only. Do not commit your real address, phone number, resume, or exported browser-side data.

Real data should live in Chrome extension storage and/or ignored local files. Use the popup's **Export profile/rules JSON** and **Import profile/rules JSON** buttons when you need to back up or restore your local save.

If your previous unpacked extension is still loaded and uses the same storage, this package preserves your existing `chrome.storage.local` values when you click **Repair/merge defaults**. It only overwrites profile/rules when you click **Reset sample defaults** or import a file that replaces them.

If Chrome treats this as a brand-new extension, export your data from the old loaded extension first, then import that JSON into this one.

## Samples

See `samples/autoapply_user_data.sample.json` for a sanitized importable sample profile. It intentionally uses fake contact/address info.

## Ignored private files

`.gitignore` blocks common local/private files, including exported AutoApply user data, local JSON profiles, resumes, and `.env` files.
