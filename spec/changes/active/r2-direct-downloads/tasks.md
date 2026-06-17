# Tasks

## Bootstrap (done)

- [x] `wrangler login` (OAuth flow completed; account ID f710bc3af01927081d8a8c9402e19348)
- [x] `wrangler r2 bucket create prompthub-releases`
- [x] `wrangler r2 bucket dev-url enable prompthub-releases` → public URL
      `https://pub-fff1cbc0121241d480624bd3de5a2735.r2.dev`
- [x] Upload `bucket-readme.md` to bucket root as `README.md`

## Code (done in this change)

- [x] `Sync stable artifacts to R2` step in `.github/workflows/release.yml`
- [x] `Skip R2 sync (preview or no token)` mirror step (forks won't fail)
- [x] `website/scripts/sync-release.mjs` — opt-in CDN mode via
      `PROMPTHUB_USE_CDN_MIRROR=1`
- [x] Two-lane download table in `README.md` and 6 locale variants
- [x] `spec/changes/active/r2-direct-downloads/{proposal,design,tasks,bucket-readme}.md`

## Maintainer follow-up (you, manual)

- [ ] Generate Cloudflare API Token at
      <https://dash.cloudflare.com/profile/api-tokens>
      with `Workers R2 Storage : Edit` scope
- [ ] Add GitHub repo secrets:
      - `CLOUDFLARE_API_TOKEN` = the new token
      - `CLOUDFLARE_ACCOUNT_ID` = `f710bc3af01927081d8a8c9402e19348`
- [ ] Cut next stable release (v0.5.7 or whatever is next).
      The CI sync step will populate R2 automatically.
- [ ] Verify R2 contents:
      ```
      curl -I https://pub-fff1cbc0121241d480624bd3de5a2735.r2.dev/latest/PromptHub-arm64.dmg
      curl    https://pub-fff1cbc0121241d480624bd3de5a2735.r2.dev/latest/latest.json
      curl    https://pub-fff1cbc0121241d480624bd3de5a2735.r2.dev/latest/checksums.txt
      ```
- [ ] Switch README "Direct download" column to point at the R2 URLs
      (replace v0.5.6 GitHub URLs with `latest/PromptHub-...`).
- [ ] Re-run `PROMPTHUB_USE_CDN_MIRROR=1 node website/scripts/sync-release.mjs`
      so the website's download buttons swap to R2.
- [ ] Update `implementation.md` with what shipped, what was verified, and
      any deltas from this plan.

## Verification

- [x] `wrangler r2 bucket list` shows `prompthub-releases`
- [x] `curl https://pub-fff1cbc0121241d480624bd3de5a2735.r2.dev/README.md`
      returns 200 and the layout doc
- [x] YAML syntax of `release.yml` parses cleanly
- [x] `pnpm --filter @prompthub/desktop typecheck` and `lint` still pass
- [x] `pnpm --filter @prompthub/desktop test:unit` still passes
      (152 files, 1263 tests)
