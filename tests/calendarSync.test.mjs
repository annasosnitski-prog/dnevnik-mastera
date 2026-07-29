import assert from 'node:assert/strict';
import test from 'node:test';

import {
  diffAndSync,
  parseDurationMin,
  buildConflictMessage,
  syncActive,
} from '../.test-dist/src/lib/calendarSync.js';

const settings = { enabled: true, endpoint: 'https://example.test/api/diary-sync', secret: 'shh' };

function makeClient(overrides = {}) {
  return { id: 'client-1', name: 'Анна', surname: '', sessions: [], consultations: [], ...overrides };
}

// Captures every fetch call made during a test so we can assert on the
// payloads diffAndSync actually sends, without hitting the network.
function withFetchSpy(run) {
  const calls = [];
  const original = global.fetch;
  global.fetch = (url, init) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body) : null });
    return Promise.resolve({ ok: true, json: async () => ({ conflicts: [] }), text: async () => '' });
  };
  try {
    run(calls);
  } finally {
    global.fetch = original;
  }
}

// ── syncActive ─────────────────────────────────────────────────────

test('syncActive requires enabled + non-empty secret + non-empty endpoint together', () => {
  assert.equal(syncActive({ enabled: true, secret: 's', endpoint: 'e' }), true);
  assert.equal(syncActive({ enabled: false, secret: 's', endpoint: 'e' }), false);
  assert.equal(syncActive({ enabled: true, secret: '  ', endpoint: 'e' }), false);
  assert.equal(syncActive({ enabled: true, secret: 's', endpoint: ' ' }), false);
});

// ── parseDurationMin ───────────────────────────────────────────────

test('parseDurationMin treats a bare number as hours by default', () => {
  assert.equal(parseDurationMin('4', 999), 240);
});

test('parseDurationMin recognizes an explicit "мин" suffix as minutes', () => {
  assert.equal(parseDurationMin('90 мин', 999), 90);
});

test('parseDurationMin recognizes a decimal comma as hours ("2,5 ч")', () => {
  assert.equal(parseDurationMin('2,5 ч', 999), 150);
});

test('parseDurationMin falls back to the given default when nothing parses', () => {
  assert.equal(parseDurationMin('целый день', 120), 120);
  assert.equal(parseDurationMin('', 120), 120);
});

// ── diffAndSync: sessions ─────────────────────────────────────────

test('diffAndSync does nothing at all when sync is not active (no secret)', () => {
  withFetchSpy((calls) => {
    const client = makeClient({ sessions: [{ id: 's1', date: '2026-08-01', time: '12:00', duration: '2 ч', area: '', style: '' }] });
    diffAndSync(null, client, { enabled: true, endpoint: 'e', secret: '' });
    assert.equal(calls.length, 0);
  });
});

test('diffAndSync upserts a new syncable session and skips a session without a valid time', () => {
  withFetchSpy((calls) => {
    const client = makeClient({
      sessions: [
        { id: 's1', date: '2026-08-01', time: '12:00', duration: '2 ч', area: 'Плечо', style: 'Дотворк' },
        { id: 's2', date: 'в июле', time: '', duration: '1 ч', area: '', style: '' }, // legacy free-text date — not syncable
      ],
    });
    diffAndSync(null, client, settings);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.action, 'upsert');
    assert.equal(calls[0].body.diaryId, 'client-1:s:s1');
    assert.equal(calls[0].body.durationMin, 120);
    assert.match(calls[0].body.descriptor, /^\[ТАТУ\]/);
  });
});

test('diffAndSync does not resend a session whose sync-relevant fields are unchanged', () => {
  withFetchSpy((calls) => {
    const session = { id: 's1', date: '2026-08-01', time: '12:00', duration: '2 ч', area: 'Плечо', style: 'Дотворк' };
    const before = makeClient({ sessions: [session] });
    // Only a non-sync field would differ in practice (note/photos aren't part
    // of SyncSession), so an identical session object simulates "client saved
    // again, nothing relevant to the calendar changed".
    const after = makeClient({ sessions: [{ ...session }] });
    diffAndSync(before, after, settings);
    assert.equal(calls.length, 0);
  });
});

test('diffAndSync resends a session when a sync-relevant field changes (e.g. time moved)', () => {
  withFetchSpy((calls) => {
    const before = makeClient({ sessions: [{ id: 's1', date: '2026-08-01', time: '12:00', duration: '2 ч', area: '', style: '' }] });
    const after = makeClient({ sessions: [{ id: 's1', date: '2026-08-01', time: '15:00', duration: '2 ч', area: '', style: '' }] });
    diffAndSync(before, after, settings);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.time, '15:00');
  });
});

test('diffAndSync sends a delete when a previously-synced session disappears', () => {
  withFetchSpy((calls) => {
    const before = makeClient({ sessions: [{ id: 's1', date: '2026-08-01', time: '12:00', duration: '2 ч', area: '', style: '' }] });
    const after = makeClient({ sessions: [] });
    diffAndSync(before, after, settings);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].body, { action: 'delete', diaryId: 'client-1:s:s1' });
  });
});

test('diffAndSync does not send a delete for a removed session that was never syncable to begin with', () => {
  withFetchSpy((calls) => {
    const before = makeClient({ sessions: [{ id: 's1', date: 'когда-нибудь', time: '', duration: '', area: '', style: '' }] });
    const after = makeClient({ sessions: [] });
    diffAndSync(before, after, settings);
    assert.equal(calls.length, 0);
  });
});

// ── diffAndSync: consultations ──────────────────────────────────────

test('diffAndSync upserts a consultation with the fixed 30-minute duration', () => {
  withFetchSpy((calls) => {
    const client = makeClient({
      consultations: [{ id: 'c1', date: '2026-08-01', time: '10:00', area: '', style: '' }],
    });
    diffAndSync(null, client, settings);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.durationMin, 30);
    assert.equal(calls[0].body.diaryId, 'client-1:c:c1');
    assert.match(calls[0].body.descriptor, /^\[ПРИЁМ\]/);
  });
});

// ── diffAndSync: client deletion ────────────────────────────────────

test('diffAndSync deletes every syncable session/consultation when the client itself is deleted (newClient=null)', () => {
  withFetchSpy((calls) => {
    const before = makeClient({
      sessions: [{ id: 's1', date: '2026-08-01', time: '12:00', duration: '', area: '', style: '' }],
      consultations: [{ id: 'c1', date: '2026-08-02', time: '09:00', area: '', style: '' }],
    });
    diffAndSync(before, null, settings);
    assert.equal(calls.length, 2);
    assert.ok(calls.every((c) => c.body.action === 'delete'));
  });
});

test('diffAndSync is a no-op when both old and new client are null', () => {
  withFetchSpy((calls) => {
    diffAndSync(null, null, settings);
    assert.equal(calls.length, 0);
  });
});

// ── buildConflictMessage ────────────────────────────────────────────

test('buildConflictMessage caps the listed conflicts at 3 even if more are returned', () => {
  const conflicts = Array.from({ length: 5 }, (_, i) => ({
    summary: `Событие ${i}`,
    start: '2026-08-01T10:00:00.000Z',
    end: '2026-08-01T11:00:00.000Z',
  }));
  const msg = buildConflictMessage(conflicts);
  assert.match(msg, /^⚠️/);
  assert.equal((msg.match(/Событие/g) || []).length, 3);
});
