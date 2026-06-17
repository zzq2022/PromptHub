# Design — R2 mirror for stable downloads

## Bucket layout

```
prompthub-releases/                      ← R2 bucket
├── README.md                            (uploaded once, documents the layout)
├── latest/                              ← MUTABLE, fixed filenames, README/website link target
│   ├── PromptHub-arm64.dmg
│   ├── PromptHub-x64.dmg
│   ├── PromptHub-Setup-x64.exe
│   ├── PromptHub-Setup-arm64.exe
│   ├── PromptHub-x64.AppImage
│   ├── PromptHub-amd64.deb
│   ├── prompthub-cli-latest.tgz
│   ├── checksums.txt                    (sha256, signs the 7 binaries above)
│   └── latest.json                      (machine-readable version pointer)
├── v0.5.7/                              ← IMMUTABLE archive (filenames retain version suffix)
│   ├── PromptHub-0.5.7-arm64.dmg
│   ├── ... (same 7 artifact set, version-suffixed)
│   └── checksums.txt
├── v0.5.8/
└── ...
```

`cli/` was originally part of the plan but folded into `latest/` because the
CLI tarball is small (~1MB) and grouping it next to the desktop binaries
makes the public URL list shorter.

## CI step

In `.github/workflows/release.yml`, after the `Create Release with gh CLI`
step finishes (so we know `release_assets/` is fully populated), we run:

```yaml
- name: Sync stable artifacts to R2
  if: ${{ stable tag && CLOUDFLARE_API_TOKEN != '' }}
  ...
- name: Skip R2 sync (preview or no token)
  if: ${{ prerelease tag || CLOUDFLARE_API_TOKEN == '' }}
  ...
```

The "Skip" twin step exists so forks without the secret get a clear log
message instead of a silent no-op or a failure.

The sync step:

1. Honors the same draft-gating Homebrew uses. If the GitHub release is still
   a draft, R2 is **not** updated (we don't want to publish a mirror copy of
   a release the maintainer hasn't promoted yet).
2. Installs wrangler 4.x globally.
3. Stages the assets into two local directories (`r2_staging/latest/` and
   `r2_staging/v<version>/`) with the right filenames.
4. Generates `checksums.txt` for both directories using `sha256sum`.
5. Generates `latest/latest.json`:
   ```json
   {
     "version": "0.5.7",
     "tag": "v0.5.7",
     "released_at": "2026-XX-XXTXX:XX:XXZ",
     "downloads": { "macArm64": "PromptHub-arm64.dmg", ... }
   }
   ```
6. Uploads each file via `wrangler r2 object put`, with explicit
   `--content-type` so browsers and `curl` see the right MIME.

## Why version-less filenames in `latest/`?

Two reasons:

1. **Stable URL property.** Anyone bookmarking
   `https://pub-fff1cbc0121241d480624bd3de5a2735.r2.dev/latest/PromptHub-arm64.dmg`
   gets the freshest stable build forever, no editing required.
2. **CDN cache friendliness.** R2's r2.dev CDN caches by URL. Keeping the
   URL stable means the cache stays warm across versions — first-byte time
   stays low.

Tradeoff: a user who points an updater at `latest/` will silently jump
versions on the next release. That's fine for the README "give me the latest
stable" flow. The in-app electron updater still pulls from
`latest-mac.yml`/`latest.yml` which live in **GitHub Releases**, not in R2,
so the auto-update lane is unaffected by anything we do in R2.

## Secrets and trust boundary

R2 upload runs in the `release` job, which already has the GitHub release
write token. We add only one new secret (`CLOUDFLARE_API_TOKEN`) plus the
non-secret `CLOUDFLARE_ACCOUNT_ID`.

The token is scoped to `Workers R2 Storage: Edit`. It cannot read other
zones, cannot deploy Workers, cannot rotate the account password. If the
token leaks, the worst case is "someone overwrites our public download
links" — which is recoverable by rotating the token + re-running the latest
release CI.

We deliberately do not use S3-compatible static credentials (Access Key ID +
Secret Access Key). Wrangler's API token flow has narrower scope and
shorter audit trail.

## README transition strategy

Until the next stable release ships and populates the R2 bucket, the README
shows two columns that **resolve to identical GitHub Releases URLs**, plus a
one-line note explaining the mirror starts in v0.5.7. After v0.5.7 lands:

1. Maintainer runs `PROMPTHUB_USE_CDN_MIRROR=1 node website/scripts/sync-release.mjs`
   to regenerate `website/src/generated/release.ts` with R2 URLs.
2. Maintainer flips the README "Direct download" column to the
   `pub-fff1cbc0121241d480624bd3de5a2735.r2.dev/latest/...` URLs.
3. From v0.5.8 onward the README never needs editing for download links.

We keep the GitHub Releases column forever as the failover lane.

## Files changed

- `.github/workflows/release.yml` — new "Sync stable artifacts to R2" step
- `website/scripts/sync-release.mjs` — opt-in CDN mode via env flag
- `README.md` + 6 locale variants — two-lane download table
- `spec/changes/active/r2-direct-downloads/bucket-readme.md` — bucket layout
  doc (also uploaded to R2 as `README.md` in the bucket root)
