# Pine Vault

A private library for unpublished Pine Script indicators, with one-click open in TradingView.

## Files
- `index.html`, `style.css`, `app.js`: the site
- `pine-vault-autopaste.user.js`: Tampermonkey/Violentmonkey helper that pastes the code into the TradingView Pine Editor and clicks Add to chart
- `.nojekyll`: tells GitHub Pages to serve files as they are

## Deploy on GitHub Pages
1. Create a new repository (e.g. `pine-vault`).
2. Upload all files from this folder to the repository root.
3. Settings > Pages > Build and deployment > Deploy from a branch > `main` / `/ (root)` > Save.
4. Your site appears at `https://<username>.github.io/pine-vault/` after a minute or two.

## How the one-click works
1. Click **Open in TradingView** on an indicator.
2. The site copies the code to your clipboard **and** opens
   `https://www.tradingview.com/chart/#pinevault=<code>`.
3. If the helper is installed, it reads the code from the URL, opens the Pine Editor,
   replaces the editor content and clicks **Add to chart**. You see a blue status box
   in the bottom-left corner while it works.
4. If the helper is not installed, the code is already on your clipboard — paste it
   manually into the Pine Editor.

Browsers do not allow one page to type into another site's editor, so the tiny helper
is the only way to make the paste fully automatic. After installing it, the site shows
an **Auto-paste on** badge and hides the setup banner.

## Install the helper
Click **Enable one-click** in the site header (or open
`https://<username>.github.io/pine-vault/pine-vault-autopaste.user.js` with
Tampermonkey/Violentmonkey installed), then **reload the site** so it can detect the helper.

If the extension does not offer to install it, create a new script in the extension
dashboard and paste the file contents.

> The helper's `@match` list contains the site URL. If you move Pine Vault to another
> domain, add that URL to `@match` in `pine-vault-autopaste.user.js`.

## Privacy
Indicators are stored in your browser's localStorage, not in the repository, so your code
is never uploaded to GitHub. Use Export for backups. The site itself is public (anyone
with the URL can open it), but each visitor only sees what is saved in their own browser.

## Troubleshooting the helper
- Chrome: open `chrome://extensions`, click Details on Tampermonkey and turn on
  "Allow User Scripts" (and Developer mode on newer versions).
- On a TradingView page, the Tampermonkey icon should show a badge with 1 when the script is active.
- A blue box at the bottom left of TradingView shows progress. A red box says which step failed
  and gives you a **Copy code** button so you can paste manually.
- If the page still shows "Enable one-click" after installing, reload the site once.