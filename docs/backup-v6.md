# Backup v6: bounded-memory export

## Why the format changed

Backup v1–v5 was one JSON document with base64 photos embedded in records.
Export first called `getAll()` for every IndexedDB store and then built the
whole JSON/File in page memory. With a photo library around 630 MB, WebKit
could hold several archive-sized representations at once and terminate the
page.

Backup v6 is a ZIP written directly to the Origin Private File System (OPFS).
The app reads one top-level IndexedDB record at a time, replaces base64 data
URLs with references, and streams the decoded binary media into the archive.

## Archive layout

```text
manifest.json
data/clients/00000001.json
data/projects/00000001.json
data/contentEntries/00000001.json
data/masterInfo.json
diagnostics/errorLog.json
media/000000001.jpg
```

`manifest.json` identifies `format: "inka-backup"`, `version: 6`, the full
restore scope, record counts, and media count. Any base64 data URL is detached
recursively, so current `photos` fields, document data URLs, and future media
fields use the same path.

## Tablet/phone flow

Export has two explicit actions:

1. **Prepare copy** writes the archive to OPFS and shows progress. It can be
   cancelled and checks available origin quota first.
2. **Save / share** opens the native share sheet from a fresh user gesture,
   which Safari requires. Cancelling the sheet keeps the prepared archive for
   another attempt.

The fallback browser download reuses the same disk-backed `File`; it does not
wrap the archive in another archive-sized `Blob`.

## Restore safety and compatibility

- ZIP records and media are read incrementally.
- Incoming records are upserted first. Records absent from the backup are
  deleted only after every archive entry was read successfully, so a corrupt
  or cancelled restore never starts by clearing the current diary.
- Content ingest jobs are cleared only when the full restore completes.
- Existing JSON backups v1–v5 remain importable.

## Deliberate limits of this step

- Peak memory is bounded by one top-level client/project/content record, not
  yet by one photo. Moving media to its own IndexedDB store is the next schema
  step that removes this final dependence.
- Normal app startup still loads the current stores into React state. This PR
  removes the extra full-database copy made specifically by export; it does not
  yet virtualize the whole application data model.
- Legacy monolithic JSON imports necessarily read their old file as a whole.
- The archive is a manual off-device backup, not cloud sync between tablet and
  phone.
