# Release checklist

Tick every box before you tag a version.
The automated checks cover almost everything.
Two things need a person: the real folder picker, and the zip on a computer that did not build it.

## Gates

- [ ] The latest commit on `main` has a green `check` and a green `e2e` run on GitHub.
- [ ] `npm run check`, `npm run build`, and `npm run schema` pass, and `git diff --exit-code -- schema/` shows nothing.
- [ ] The browser suite passes: `npm run test:e2e`.
- [ ] The frame-time gate holds on a quiet machine: `npx playwright test e2e/performance.spec.ts --workers=1`.
- [ ] The journey passes in WebKit and in Firefox: `npm run test:browsers`.
  Run `npx playwright install webkit firefox` once first.
  CI does not run these two browsers.
- [ ] `version` in `package.json` is the version you are about to tag, and `docs/release-notes/<version>.md` exists and is true.

## The zip

- [ ] Build the folder of the zip: `npm run build && node scripts/package-release.ts`.
  It prints the folder, `release/anatomy-<version>`.
- [ ] In that folder, `node serve.mjs` prints an address.
  Open it in Chrome, and open each built-in example.
  The map shows, and the browser console has no error.
- [ ] `README-run.txt` says what you just did.

## The real folder picker

The browser tests use a stand-in folder, so only a person can check the native picker.
Do this in Chrome, against the page that `serve.mjs` serves.
Then do steps 1 to 4 again in Edge if you have it.

Set up a scratch folder first:

```sh
mkdir /tmp/anatomy-check
cp e2e/fixtures/refund-approval.board.json /tmp/refund-board.json
```

- [ ] 1. Click **Open folder**, and pick `/tmp/anatomy-check`.
  Chrome asks for access to the folder.
  Allow it.
  The page says "anatomy-check has no board yet."
- [ ] 2. Click **Copy prompt**.
  Look in `/tmp/anatomy-check/.anatomy`: it has `README.md`, `board.schema.json`, `anatomy.mjs`, and a `guide` folder, and nothing outside `.anatomy`.
- [ ] 3. Copy `/tmp/refund-board.json` to `/tmp/anatomy-check/.anatomy/board.json`.
  The map opens within a few seconds, with no click.
- [ ] 4. Reload the page.
  The folder opens again, or the page shows **Reopen anatomy-check**, and one click opens it.
- [ ] 5. Select a part, type a note under **Add a note**, wait a second, and look in `.anatomy`.
  `layer.json` is there and holds the note.
- [ ] 6. Click **Send to agent**, then **Send**.
  `feedback.json` appears in `.anatomy`.
  The prompt is on the clipboard: paste it somewhere to check.
- [ ] 7. Run `node .anatomy/anatomy.mjs validate .anatomy/board.json` in the folder.
  It reports a valid board.
- [ ] 8. Click **Open folder** again and cancel the picker.
  Nothing changes and there is no error.
- [ ] 9. Open the page in Firefox or Safari.
  The page says that the browser cannot open folders, and **Open file** works.

Clean up with `rm -rf /tmp/anatomy-check /tmp/refund-board.json`.

## Tag

The tag and `version` in `package.json` must match, or the release workflow stops before it builds anything.
For a new version, run `npm version <patch|minor> --no-git-tag-version`, write `docs/release-notes/<version>.md`, and merge both to `main` first.

```sh
git switch main && git pull
git tag -a v<version> -m "Anatomy <version>"
git push origin v<version>
```

- [ ] The release workflow is green, and the release has the zip `anatomy-<version>.zip` and the notes.
- [ ] Download that zip on another folder or computer, unzip it, run `node serve.mjs`, and open an example.
