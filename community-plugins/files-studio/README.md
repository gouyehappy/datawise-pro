# Files Studio (community plugin)

Unified file workbench for local folders and OpenDAL backends (S3-compatible, Azure Blob, GCS, Huawei OBS, WebDAV, FTP, SFTP). Host navigator picks the connection; the workbench is **Browser · Transfers · Archives · Guard**. Cross-mount copy uses the transfer drawer mount selectors.

Chrome, breadcrumb root, and “copy path” share one URI-style location per scheme (`sftp://…`, `s3://…`, `local://…`, `smb://…`, …). Path segments under that root come from the current browser prefix.

## Build

```bash
node community-plugins/files-studio/package.mjs
```

Requires Rust toolchain + OpenDAL feature crates. Output: `dist/io.datawise.community.files-studio-<ver>-<os-arch>.dwp`.

Install in DataWise: Community plugins → allow unsigned (dev) → install the `.dwp`.

## Layout

| Path | Role |
|------|------|
| `manifest.datawise.json` | connection-provider + workbench |
| `backend/` | Rust sidecar (OpenDAL + transfer/archive/guard) |
| `ui/` | Workbench static UI |
| `shared/sdk/rust/datawise-plugin-sdk` | Vendored host protocol SDK |

## Private RPCs (UI → sidecar)

- `files/mounts`, `files/list`, `files/stat`, `files/mkdir`, `files/delete`, `files/put`, `files/read`
- `files/transfer/create|list|get|cancel`
- `files/archive/create|list`
- `files/guard`, `files/guard/pending|confirm|audit`

**Platform notes**

- S3 account-root (empty bucket): browse and open a bucket first; upload / mkdir / pack need `bucket/…` paths. Inside a bucket, signed S3 calls cover list/put/get/delete/copy/pack/unpack/storage-class.
- Large files (>~4MB) use transfer tasks with host-picked local paths so they bypass the JSON base64 limit.
- Copy/sync/upload/download transfers recurse directories.
- SFTP uses an SSH subsystem session (password or PEM), including on Windows.
- SMB/CIFS on Windows attaches the share with the logged-in or supplied credentials, then reads it as a UNC path. Other operating systems show a clear error.
