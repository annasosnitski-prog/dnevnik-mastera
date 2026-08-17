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

The file is named `inka-backup-<owner>-<date>.zip`. The extension is a plain,
single `.zip` on purpose: phones identify a file by its extension, and anything
they cannot identify travels as an untyped item — the share sheet does not know
what to do with it and the file picker can grey it out. Import never trusts the
name; it reads the `PK` signature.

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
restore scope, record counts, media count, master name, and a stable id of the
browser installation that created it. Any base64 data URL is detached
recursively, so current `photos` fields, document data URLs, and future media
fields use the same path.

The source identity is a safety label, not an account or sync key. Each master
keeps a separate, independent database. A restore from another named master shows
an extra confirmation before it can replace the current diary; restoring the
same master's copy on a new phone/tablet is labelled as another device and
also requires the cross-device acknowledgement because the restore is still
destructive.

## Tablet/phone flow

Export has two explicit actions:

1. **Prepare copy** writes the archive to OPFS and shows progress. It can be
   cancelled and checks available origin quota first. Before the archive is
   called ready it is read back — ZIP directory, manifest, and record counts —
   so "written" is never mistaken for "readable".
2. **Save / share** opens the native share sheet from a fresh user gesture,
   which Safari requires. Cancelling the sheet keeps the prepared archive for
   another attempt. The success message names the file and its size, because
   what the system did with the file after the sheet closed is not observable
   from the page.

The share payload is `{ files: [file] }` and nothing else. A `title` next to the
files is not decoration: when iOS cannot hand the file to the chosen target it
silently shares the remaining text item instead, and "Save to Files" writes that
title into a `.txt`. A 38-byte "backup" containing the words `INKA — резервная
копия` is what that looks like from the outside — an export that reported
success and produced no copy. If the browser could not derive a type for the
OPFS file, it is re-wrapped once with `application/zip` (blob parts reference
the file on disk, so this does not copy its bytes).

The fallback browser download reuses the same disk-backed `File`; it does not
wrap the archive in another archive-sized `Blob`.

## Restore safety and compatibility

- ZIP records and media are read incrementally.
- The file picker has no `accept` filter — a copy arrives in Files through the
  share sheet and can carry any type, and a filtered picker greys it out.
  Whether a picked file is an archive is decided by its `PK` signature; a file
  that is neither archive nor legacy JSON is explained by what it actually
  contains (the share-title `.txt` above is named as such), not by a generic
  "this is not an INKA backup".
- A successful restore reloads the app instead of pulling the freshly restored
  library back into the page that just parsed the archive. Those five `getAll`
  calls on top of a peak-memory page are the heaviest step of the whole import
  and the prime suspect behind restores that ended on a white screen. The
  result line survives the reload in `localStorage`. A cancelled or failed
  restore does not reload, so it still syncs React state from IndexedDB.
- Incoming records are upserted first. Records absent from the backup are
  deleted only after every archive entry was read successfully, so a corrupt
  or cancelled restore never starts by clearing the current diary.
- Content ingest jobs are cleared only when the full restore completes.
- Existing JSON backups v1–v5 remain importable.
- Early/legacy archives without source identity remain importable and are
  shown as an unknown source instead of being mistaken for the current diary.

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
