# R2 mirror for stable downloads

## Why

Today every download link in `README.md`, the 6 locale README variants, and the
marketing site (`apps/web` Astro pages, generated from
`website/src/generated/release.ts`) points at GitHub Releases with a path that
includes the literal version number, e.g.
`https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-0.5.6-arm64.dmg`.
That works, but it has three downsides:

- README and website have to be re-edited at every release just to bump the
  filename.
- External docs / blog posts / scripts that hard-coded a version-suffixed URL
  go stale immediately when a new release ships.
- Releases is a single point of failure for our download flow. When GitHub
  has its periodic asset hiccups, users see broken installs.

We want a stable, fixed-filename download URL that the README, the website and
external scripts can all bookmark forever.

## Scope

In scope:

- Provision a Cloudflare R2 bucket `prompthub-releases` (done in this change).
- Public access via the bucket's auto-generated `r2.dev` URL.
- Layout: `latest/` (overwritten each stable release with version-less names)
  + `v<version>/` (immutable archive with version-suffixed names) +
  `cli/latest/` for the CLI tarball.
- Release CI step that uploads stable-only artifacts to both prefixes,
  generates `checksums.txt` and `latest/latest.json` automatically.
- README + locale READMEs gain a "Direct download / GitHub Releases" two-lane
  download table (kept on equal visual weight; both columns use the same
  badge style).
- Website's `sync-release.mjs` learns to optionally point at the R2 mirror
  via the `PROMPTHUB_USE_CDN_MIRROR=1` env flag once the mirror has been
  bootstrapped with at least one stable release.

Explicitly out of scope:

- Custom domain. The bucket uses the `pub-<hash>.r2.dev` URL directly
  because the user prefers not to spend an extra subdomain on this.
- Backfilling existing releases (0.5.6 etc.) into R2. The mirror starts
  populating from the next stable tag onward to avoid wasting bandwidth on a
  one-time backfill.
- Preview / prerelease channel. The mirror is stable-only by policy.

## Risks & rollback

- **The R2 bucket has no files until the next stable tag fires the new CI
  step.** During the transition (currently v0.5.6) the README's "Direct
  download" column intentionally points at the same GitHub Releases URLs as
  the right column, with a one-line note explaining the mirror starts in
  v0.5.7. So the user-facing experience is "two columns that resolve to the
  same place" — annoying redundancy but no broken links.
- If the R2 mirror ever goes down, the README and website still have working
  Releases links. We never make R2 the only path.
- Rollback: deleting the bucket + reverting the `Sync stable artifacts to R2`
  step in `release.yml` is enough to undo. README still works because both
  columns currently link into Releases.

## Required GitHub repo secrets

For the R2 sync step to actually upload, the maintainer must add to the
GitHub repo `Settings → Secrets and variables → Actions`:

- `CLOUDFLARE_API_TOKEN` — a Custom Token with `Workers R2 Storage : Edit`
  scope. Generate at https://dash.cloudflare.com/profile/api-tokens.
- `CLOUDFLARE_ACCOUNT_ID = f710bc3af01927081d8a8c9402e19348`

Until both are set, the CI step skips itself with a clear log line and the
release otherwise continues normally. Forks therefore won't fail.

## Bucket details

- Name: `prompthub-releases`
- Storage class: Standard
- Public URL: `https://pub-fff1cbc0121241d480624bd3de5a2735.r2.dev`
- Owner account: `f710bc3af01927081d8a8c9402e19348`
- Created with `wrangler r2 bucket create` on 2026-05-17.
