# AutoApply local-data package 0.2.2

## Main changes

- Removed committed personal profile defaults from `background.js`.
- `background.js` now loads profile/rule defaults from JSON files:
  - first: `samples/autoapply_user_data.sample.json`
  - overlay, if present: `local/autoapply_user_data.local.json`
- `local/` is gitignored, except for `README.md` and `.gitkeep`.
- Added a private `local/autoapply_user_data.local.json` in this downloadable package so your current local test data is preserved, but it should not be committed.
- Added a commit-safe sample data bundle in `samples/`.
- Popup wording now distinguishes merge vs. reload:
  - **Merge local/default data** preserves existing browser-side values and adds missing keys/rules.
  - **Reload from local/default data** rebuilds browser-side values from local JSON when available, otherwise sample JSON.

## Important

Before committing, verify `git status` does not include anything under `local/` except `local/README.md` and `local/.gitkeep`.
