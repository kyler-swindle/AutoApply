# AutoApply Local Assistant

Local-only Chrome extension prototype for detecting job application pages, scanning fields, and filling matched answers from local browser storage.

## Privacy model

Committed files should contain only code and sample data. Real personal profile data belongs in:

```text
local/autoapply_user_data.local.json
```

The `local/` folder is gitignored, so it can exist in your unpacked extension directory without being committed.

## Local testing

1. Unzip this package.
2. Keep or replace `local/autoapply_user_data.local.json` with your private data.
3. Go to `chrome://extensions`.
4. Enable Developer mode.
5. Click **Load unpacked** and select this folder.
6. Open the popup and click **Reload from local/default data** once.

## Data files

- `samples/autoapply_user_data.sample.json`: commit-safe fake/sample data.
- `local/autoapply_user_data.local.json`: private real local data. Do not commit.

## Notes

The extension stores active profile/rules in `chrome.storage.local`. The local JSON file is used as a source when repairing/reloading storage, but Chrome will not automatically write changes back to the repo directory. Use the popup export button if you want to save browser-side changes back to a local JSON file manually.
