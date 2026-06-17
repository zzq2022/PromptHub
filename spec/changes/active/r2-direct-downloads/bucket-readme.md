# PromptHub Releases (R2 bucket)

This Cloudflare R2 bucket hosts the **stable** PromptHub desktop release
artifacts so the README and the marketing site can link to fixed-domain
download URLs without bouncing through a GitHub Releases page.

## Layout

```
prompthub-releases/
├── README.md                      ← this file
├── latest/                        ← always points at the current stable build
│   ├── PromptHub-arm64.dmg
│   ├── PromptHub-x64.dmg
│   ├── PromptHub-Setup-x64.exe
│   ├── PromptHub-Setup-arm64.exe
│   ├── PromptHub-x64.AppImage
│   ├── PromptHub-amd64.deb
│   ├── checksums.txt
│   └── latest.json                ← { "version": "0.5.6", "released_at": "..." }
├── v0.5.6/                        ← per-version archive
│   ├── PromptHub-0.5.6-arm64.dmg
│   ├── ... (same set, version-suffixed filenames)
│   └── checksums.txt
└── cli/
    └── latest/
        └── prompthub-cli-latest.tgz
```

## Conventions

- Only **stable** tags (no `-beta`, `-alpha`, `-rc`) are published here.
  Preview channel builds stay on GitHub Releases.
- Every release CI run does two writes:
  1. `v<version>/...` — versioned archive, never overwritten.
  2. `latest/...` — moving pointer; overwritten on each stable release.
- Old versioned folders are kept indefinitely. Cleanup, if ever needed, is
  a manual operation.
- Filenames in `latest/` carry **no version suffix** so README / website
  links stay stable across releases.
- `checksums.txt` is a SHA256 sidecar; users can verify with
  `shasum -a 256 -c checksums.txt`.

## Public access

This bucket is fronted by the (planned) custom domain `download.<your-domain>`.
The `r2.dev` development subdomain is intentionally **not** enabled to avoid
brittle, unpredictable URLs in user-facing docs.

Source of truth for the deploy pipeline: `.github/workflows/release.yml`.
