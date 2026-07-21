# C2PA trust lists

Certificate trust lists used to decide whether a Content Credential was signed
by a known, trusted signer. They are passed to `@contentauth/c2pa-web` in
`src/main.ts` and compiled into the bundle as raw text, so verification works
without any runtime trust-list fetches.

| File | Purpose | Source |
| --- | --- | --- |
| `C2PA-TRUST-LIST.pem` | Official C2PA trust list: CA anchors for conforming generator products | [c2pa-org/conformance-public](https://github.com/c2pa-org/conformance-public/tree/main/trust-list) |
| `C2PA-TSA-TRUST-LIST.pem` | Official C2PA time-stamping authority (TSA) trust list | [c2pa-org/conformance-public](https://github.com/c2pa-org/conformance-public/tree/main/trust-list) |
| `anchors.pem` | Interim Content Credentials trust list — frozen 2026-01-01, still required to validate credentials signed before the official list existed (e.g. older Adobe tooling) | [contentcredentials.org/trust](https://contentcredentials.org/trust/anchors.pem) |
| `allowed.sha256.txt` | Interim allowed list: base64 SHA-256 hashes of known end-entity signing certificates | [contentcredentials.org/trust](https://contentcredentials.org/trust/allowed.sha256.txt) |
| `store.cfg` | Trust store config: extended key usage (EKU) OIDs a signing certificate may carry | [contentcredentials.org/trust](https://contentcredentials.org/trust/store.cfg) |

The two official PEM lists and the interim anchors are concatenated and used as
trust anchors; the allowed list and EKU config are passed alongside. Anything
not chaining to these lists is reported as `signingCredential.untrusted`.

## Updating

Trust lists change as new vendors are added, so refresh them periodically:

```sh
npm run update-trust-list
```

This re-fetches every file above from its source, validates the content, and
overwrites this directory. Review the diff and commit.

Last updated: 2026-07-21
