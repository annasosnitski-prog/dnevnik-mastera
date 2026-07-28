import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeContentEntryLink,
  isContentEntryLinked,
  resolveContentEntryLink,
  resolveContentEntryProjectId,
  setContentEntryLink,
  buildContentProjectOptions,
  buildContentSessionOptions,
} from '../.test-dist/src/lib/contentLink.js';

function makeProject(overrides = {}) {
  return {
    id: 'project-1',
    title: 'Дракон',
    color: '#B0413E',
    category: 'tattoo',
    clientId: null,
    stage: 'idea',
    state: 'active',
    waitingFor: 'none',
    nextActionText: '',
    nextActionDate: null,
    nextActionType: null,
    priority: 'normal',
    area: '',
    style: '',
    generalNotes: '',
    feeling: '',
    creative: '',
    inspirationSources: '',
    photos: [],
    createdDate: '2026-01-01',
    sessions: [],
    ...overrides,
  };
}

function makeClient(overrides = {}) {
  return {
    id: 'client-1',
    name: 'Анна',
    surname: 'Соснитски',
    color: '#3E7CA6',
    sessions: [],
    consultations: [],
    ...overrides,
  };
}

function makeSession(overrides = {}) {
  return {
    id: 'session-1',
    name: 'Первая',
    date: '2026-02-01',
    time: '',
    duration: '',
    style: '',
    area: '',
    colors: '',
    needles: '',
    skinReaction: '',
    note: '',
    photos: [],
    done: false,
    healed: false,
    cancelled: false,
    projectId: null,
    ...overrides,
  };
}

function makeConsultation(overrides = {}) {
  return {
    id: 'consultation-1',
    date: '2026-02-01',
    time: '',
    area: '',
    style: '',
    generalNotes: '',
    feeling: '',
    creative: '',
    inspirationSources: '',
    urgency: 'none',
    photos: [],
    done: false,
    cancelled: false,
    createdDate: '2026-01-01',
    projectId: null,
    ...overrides,
  };
}

function makeEntry(overrides = {}) {
  return {
    id: 'entry-1',
    createdDate: '2026-02-01T00:00:00.000Z',
    clientId: null,
    sourceType: 'freeform',
    sourceId: null,
    format: null,
    text: '',
    context: { client: '', zone: '', style: '', description: '' },
    photos: [],
    contentDraft: null,
    visualArchetype: null,
    textTriad: null,
    textDraft: 'Готовый текст',
    status: 'confirmed',
    isExemplar: false,
    ...overrides,
  };
}

test('an old entry without link normalizes to undefined, not null (legacy vs explicit "no link")', () => {
  const entry = makeEntry();
  delete entry.link;
  assert.equal(normalizeContentEntryLink(entry).link, undefined);
});

test('an explicit link: null is preserved as null, not collapsed to undefined', () => {
  assert.equal(normalizeContentEntryLink({ link: null }).link, null);
});

test('a garbage/foreign link value normalizes to explicit null (present but untrustworthy)', () => {
  assert.equal(normalizeContentEntryLink({ link: 'nonsense' }).link, null);
  assert.equal(normalizeContentEntryLink({ link: { type: 'unknown' } }).link, null);
});

test('project-link stores only projectId, dropping any extra fields', () => {
  const normalized = normalizeContentEntryLink({ link: { type: 'project', projectId: 'p1', extra: 'x' } });
  assert.deepEqual(normalized.link, { type: 'project', projectId: 'p1' });
});

test('session-link stores only sessionId, dropping any extra fields', () => {
  const normalized = normalizeContentEntryLink({ link: { type: 'session', sessionId: 's1', projectId: 'p1' } });
  assert.deepEqual(normalized.link, { type: 'session', sessionId: 's1' });
  assert.ok(!('projectId' in normalized.link));
});

test('the project for a session-link is computed through session.projectId', () => {
  const project = makeProject({ id: 'project-9' });
  const session = makeSession({ id: 'session-9', projectId: project.id });
  const client = makeClient({ sessions: [session] });
  const entry = makeEntry({ link: { type: 'session', sessionId: session.id } });

  assert.equal(resolveContentEntryProjectId(entry, [project], [client]), project.id);
});

test('an entry created from an existing session is already considered linked (link still undefined)', () => {
  const entry = makeEntry({ sourceType: 'session', sourceId: 'session-1' });
  delete entry.link;
  assert.equal(isContentEntryLinked(entry), true);
});

test('an entry with an explicit link is considered linked (the approval sheet gate)', () => {
  const entry = makeEntry({ sourceType: 'freeform', sourceId: null, link: { type: 'project', projectId: 'p1' } });
  assert.equal(isContentEntryLinked(entry), true);
});

test('a freeform entry with no link is not considered linked (the approval sheet gate)', () => {
  const entry = makeEntry({ sourceType: 'freeform', sourceId: null, link: null });
  assert.equal(isContentEntryLinked(entry), false);
});

test('setContentEntryLink(entry, null) keeps status confirmed — closing the sheet does not revert approval', () => {
  const entry = makeEntry({ status: 'confirmed', link: { type: 'project', projectId: 'p1' } });
  const updated = setContentEntryLink(entry, null);
  assert.equal(updated.status, 'confirmed');
  assert.equal(updated.link, null);
});

test('"leave unlinked" saves link: null while keeping confirmed status', () => {
  const entry = makeEntry({ status: 'confirmed' });
  delete entry.link;
  const updated = setContentEntryLink(entry, null);
  assert.equal(updated.status, 'confirmed');
  assert.equal(updated.link, null);
});

test('a link can be added later from the card (previously unlinked)', () => {
  const entry = makeEntry({ link: null });
  const updated = setContentEntryLink(entry, { type: 'project', projectId: 'p1' });
  assert.deepEqual(updated.link, { type: 'project', projectId: 'p1' });
});

test('an existing link can be replaced with a different one', () => {
  const entry = makeEntry({ link: { type: 'project', projectId: 'p1' } });
  const updated = setContentEntryLink(entry, { type: 'session', sessionId: 's1' });
  assert.deepEqual(updated.link, { type: 'session', sessionId: 's1' });
});

test('a deleted/missing project gives a safe "missing" fallback, not data loss', () => {
  const entry = makeEntry({ link: { type: 'project', projectId: 'ghost-project' } });
  const resolved = resolveContentEntryLink(entry, [], []);
  assert.deepEqual(resolved, { kind: 'missing', link: { type: 'project', projectId: 'ghost-project' } });
});

test('a deleted/missing session gives a safe "missing" fallback, not data loss', () => {
  const entry = makeEntry({ link: { type: 'session', sessionId: 'ghost-session' } });
  const resolved = resolveContentEntryLink(entry, [], []);
  assert.deepEqual(resolved, { kind: 'missing', link: { type: 'session', sessionId: 'ghost-session' } });
});

test('a dangling source-session (sourceType session, deleted session, link still undefined) also resolves as missing', () => {
  const entry = makeEntry({ sourceType: 'session', sourceId: 'ghost-session' });
  delete entry.link;
  const resolved = resolveContentEntryLink(entry, [], []);
  assert.deepEqual(resolved, { kind: 'missing', link: { type: 'session', sessionId: 'ghost-session' } });
});

test('a source-consultation entry (no manual link) resolves its project through consultation.projectId', () => {
  const project = makeProject({ id: 'project-consult' });
  const consultation = makeConsultation({ id: 'consult-1', projectId: project.id });
  const client = makeClient({ consultations: [consultation] });
  const entry = makeEntry({ sourceType: 'consultation', sourceId: consultation.id });
  delete entry.link;

  assert.equal(resolveContentEntryProjectId(entry, [project], [client]), project.id);
  const resolved = resolveContentEntryLink(entry, [project], [client]);
  assert.equal(resolved.kind, 'consultation');
  assert.equal(resolved.consultation.id, consultation.id);
  assert.equal(resolved.project?.id, project.id);
});

test('an explicit link: null on a source-consultation entry is treated as unlinked, not the consultation', () => {
  const project = makeProject({ id: 'project-consult' });
  const consultation = makeConsultation({ id: 'consult-1', projectId: project.id });
  const client = makeClient({ consultations: [consultation] });
  const entry = makeEntry({ sourceType: 'consultation', sourceId: consultation.id, link: null });

  assert.equal(resolveContentEntryProjectId(entry, [project], [client]), null);
  assert.deepEqual(resolveContentEntryLink(entry, [project], [client]), { kind: 'none' });
});

test('a dangling source-consultation (deleted consultation, link still undefined) resolves as missing, not a crash', () => {
  const entry = makeEntry({ sourceType: 'consultation', sourceId: 'ghost-consultation' });
  delete entry.link;

  assert.equal(resolveContentEntryProjectId(entry, [], []), null);
  assert.deepEqual(resolveContentEntryLink(entry, [], []), { kind: 'missing-consultation', consultationId: 'ghost-consultation' });
});

test('resolveContentEntryLink does not mutate Project[], Client[] or the entry', () => {
  const project = makeProject({ id: 'project-1' });
  const session = makeSession({ id: 'session-1', projectId: project.id });
  const client = makeClient({ id: 'client-1', sessions: [session] });
  const entry = makeEntry({ link: { type: 'session', sessionId: session.id } });

  const projects = [project];
  const clients = [client];
  const projectsSnapshot = structuredClone(projects);
  const clientsSnapshot = structuredClone(clients);
  const entrySnapshot = structuredClone(entry);

  resolveContentEntryLink(entry, projects, clients);
  buildContentProjectOptions(projects, entry.clientId);
  buildContentSessionOptions(clients, projects, entry.clientId);

  assert.deepEqual(projects, projectsSnapshot);
  assert.deepEqual(clients, clientsSnapshot);
  assert.deepEqual(entry, entrySnapshot);
});

test('sessions without a projectId are never offered as link options', () => {
  const client = makeClient({ sessions: [makeSession({ id: 's-no-project', projectId: null })] });
  const options = buildContentSessionOptions([client], [], null);
  assert.equal(options.length, 0);
});

test('projectId is not duplicated alongside sessionId in a session-link', () => {
  const link = normalizeContentEntryLink({ link: { type: 'session', sessionId: 's1', projectId: 'p1' } }).link;
  assert.deepEqual(Object.keys(link).sort(), ['sessionId', 'type']);
});

test('changing the link does not touch textDraft, photos, translations, status, isExemplar, sourceType or sourceId', () => {
  const entry = makeEntry({
    textDraft: 'Неизменный текст',
    photos: ['photo-a', 'photo-b'],
    translations: { en: { sourceText: 'x', translatedText: 'y', translatedAt: 'now' } },
    status: 'confirmed',
    isExemplar: true,
    sourceType: 'session',
    sourceId: 'session-1',
    link: null,
  });

  const updated = setContentEntryLink(entry, { type: 'project', projectId: 'p1' });

  assert.equal(updated.textDraft, entry.textDraft);
  assert.deepEqual(updated.photos, entry.photos);
  assert.deepEqual(updated.translations, entry.translations);
  assert.equal(updated.status, entry.status);
  assert.equal(updated.isExemplar, entry.isExemplar);
  assert.equal(updated.sourceType, entry.sourceType);
  assert.equal(updated.sourceId, entry.sourceId);
});

test('resolveContentEntryProjectId falls back to the source session\'s projectId when link is undefined', () => {
  const project = makeProject({ id: 'project-src' });
  const session = makeSession({ id: 'session-src', projectId: project.id });
  const client = makeClient({ sessions: [session] });
  const entry = makeEntry({ sourceType: 'session', sourceId: session.id });
  delete entry.link;

  assert.equal(resolveContentEntryProjectId(entry, [project], [client]), project.id);
});

test('an explicit link: null on a source-session entry is treated as unlinked, not the source session', () => {
  const project = makeProject({ id: 'project-src' });
  const session = makeSession({ id: 'session-src', projectId: project.id });
  const client = makeClient({ sessions: [session] });
  const entry = makeEntry({ sourceType: 'session', sourceId: session.id, link: null });

  assert.equal(isContentEntryLinked(entry), false);
  assert.equal(resolveContentEntryProjectId(entry, [project], [client]), null);
  assert.deepEqual(resolveContentEntryLink(entry, [project], [client]), { kind: 'none' });
});

test('"leave unlinked" (setContentEntryLink(entry, null)) on a source-session entry shows "not linked", not the source session', () => {
  const project = makeProject({ id: 'project-src' });
  const session = makeSession({ id: 'session-src', projectId: project.id });
  const client = makeClient({ sessions: [session] });
  const sourceLinkedEntry = makeEntry({ sourceType: 'session', sourceId: session.id });
  delete sourceLinkedEntry.link;
  assert.equal(isContentEntryLinked(sourceLinkedEntry), true); // before: fallback applies

  const explicitlyUnlinked = setContentEntryLink(sourceLinkedEntry, null);
  assert.equal(isContentEntryLinked(explicitlyUnlinked), false);
  assert.deepEqual(resolveContentEntryLink(explicitlyUnlinked, [project], [client]), { kind: 'none' });
});

test('explicit null survives a persist/reload round-trip without reverting to the source-session fallback', () => {
  const project = makeProject({ id: 'project-src' });
  const session = makeSession({ id: 'session-src', projectId: project.id });
  const client = makeClient({ sessions: [session] });
  const entry = makeEntry({ sourceType: 'session', sourceId: session.id, link: null });

  // Simulate an IndexedDB round-trip via JSON (structuredClone would keep
  // `null` too, but JSON is what a real put()/getAll() pair effectively does
  // for a plain-data record like this).
  const reloaded = JSON.parse(JSON.stringify(entry));
  const normalized = normalizeContentEntryLink(reloaded);

  assert.equal(normalized.link, null);
  assert.equal(isContentEntryLinked(reloaded), false);
  assert.deepEqual(resolveContentEntryLink(reloaded, [project], [client]), { kind: 'none' });
});

test('an explicit project/session link takes priority over sourceType/sourceId', () => {
  const sourceProject = makeProject({ id: 'project-source' });
  const sourceSession = makeSession({ id: 'session-source', projectId: sourceProject.id });
  const explicitProject = makeProject({ id: 'project-explicit' });
  const client = makeClient({ sessions: [sourceSession] });

  const entry = makeEntry({
    sourceType: 'session',
    sourceId: sourceSession.id,
    link: { type: 'project', projectId: explicitProject.id },
  });

  const projects = [sourceProject, explicitProject];
  assert.equal(resolveContentEntryProjectId(entry, projects, [client]), explicitProject.id);
  const resolved = resolveContentEntryLink(entry, projects, [client]);
  assert.equal(resolved.kind, 'project');
  assert.equal(resolved.project.id, explicitProject.id);
});

test('a client\'s own projects/sessions are sorted first, without hiding the rest', () => {
  const clientProject = makeProject({ id: 'p-client', clientId: 'client-1' });
  const otherProject = makeProject({ id: 'p-other', clientId: 'client-2' });

  const options = buildContentProjectOptions([otherProject, clientProject], 'client-1');

  assert.equal(options.length, 2);
  assert.equal(options[0].project.id, 'p-client');
  assert.equal(options[0].isPreferredClient, true);
  assert.equal(options[1].project.id, 'p-other');
  assert.equal(options[1].isPreferredClient, false);
});
