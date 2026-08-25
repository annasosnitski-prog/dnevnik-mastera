import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { getContentEntriesForProject } from '../.test-dist/src/lib/contentProject.js';
import { resolveContentPhotoSelection } from '../.test-dist/src/lib/contentPhotoSelection.js';

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
    consultations: [],
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

test('a direct project-link entry belongs to that project', () => {
  const project = makeProject({ id: 'project-target' });
  const entry = makeEntry({ id: 'e1', link: { type: 'project', projectId: project.id } });

  const result = getContentEntriesForProject([entry], project.id, [project], []);

  assert.equal(result.length, 1);
  assert.equal(result[0].entry.id, 'e1');
  assert.equal(result[0].link.kind, 'project');
  assert.equal(result[0].link.project.id, project.id);
});

test('a session-link entry belongs to the project via session.projectId', () => {
  const project = makeProject({ id: 'project-target' });
  const session = makeSession({ id: 'session-1', projectId: project.id });
  const client = makeClient({ sessions: [session] });
  const entry = makeEntry({ id: 'e1', link: { type: 'session', sessionId: session.id } });

  const result = getContentEntriesForProject([entry], project.id, [project], [client]);

  assert.equal(result.length, 1);
  assert.equal(result[0].link.kind, 'session');
  assert.equal(result[0].link.session.id, session.id);
});

test('a legacy sourceType==="session" entry (no manual link) belongs via sourceId', () => {
  const project = makeProject({ id: 'project-target' });
  const session = makeSession({ id: 'session-1', projectId: project.id });
  const client = makeClient({ sessions: [session] });
  const entry = makeEntry({ id: 'e1', sourceType: 'session', sourceId: session.id });
  delete entry.link;

  const result = getContentEntriesForProject([entry], project.id, [project], [client]);

  assert.equal(result.length, 1);
  assert.equal(result[0].link.kind, 'session');
});

test('a source-consultation entry (no manual link) belongs via consultation.projectId', () => {
  const project = makeProject({ id: 'project-target' });
  const consultation = makeConsultation({ id: 'consult-1', projectId: project.id });
  const client = makeClient({ consultations: [consultation] });
  const entry = makeEntry({ id: 'e1', sourceType: 'consultation', sourceId: consultation.id });
  delete entry.link;

  const result = getContentEntriesForProject([entry], project.id, [project], [client]);

  assert.equal(result.length, 1);
  assert.equal(result[0].link.kind, 'consultation');
  assert.equal(result[0].link.consultation.id, consultation.id);
});

test('a single entry matching the project is never duplicated in the result', () => {
  // Session-link AND a matching sourceType/sourceId — resolveContentEntryProjectId
  // already prioritizes the explicit link, so there is only ever one match.
  const project = makeProject({ id: 'project-target' });
  const session = makeSession({ id: 'session-1', projectId: project.id });
  const client = makeClient({ sessions: [session] });
  const entry = makeEntry({
    id: 'e1',
    sourceType: 'session',
    sourceId: session.id,
    link: { type: 'session', sessionId: session.id },
  });

  const result = getContentEntriesForProject([entry], project.id, [project], [client]);

  assert.equal(result.length, 1);
});

test('an entry linked to a different project is excluded', () => {
  const thisProject = makeProject({ id: 'project-this' });
  const otherProject = makeProject({ id: 'project-other' });
  const entry = makeEntry({ id: 'e1', link: { type: 'project', projectId: otherProject.id } });

  const result = getContentEntriesForProject([entry], thisProject.id, [thisProject, otherProject], []);

  assert.deepEqual(result, []);
});

test('a draft entry is not shown even if it matches the project', () => {
  const project = makeProject({ id: 'project-target' });
  const entry = makeEntry({ id: 'e1', status: 'draft', link: { type: 'project', projectId: project.id } });

  const result = getContentEntriesForProject([entry], project.id, [project], []);

  assert.deepEqual(result, []);
});

test('a confirmed entry is shown', () => {
  const project = makeProject({ id: 'project-target' });
  const entry = makeEntry({ id: 'e1', status: 'confirmed', link: { type: 'project', projectId: project.id } });

  const result = getContentEntriesForProject([entry], project.id, [project], []);

  assert.equal(result.length, 1);
});

test('a deleted session, deleted consultation, or corrupted link safely excludes the entry (no crash, no auto-fix)', () => {
  const project = makeProject({ id: 'project-target' });
  const danglingSession = makeEntry({ id: 'e1', link: { type: 'session', sessionId: 'ghost-session' } });
  const danglingConsultation = makeEntry({ id: 'e2', sourceType: 'consultation', sourceId: 'ghost-consultation' });
  delete danglingConsultation.link;
  const corrupted = makeEntry({ id: 'e3', link: 'not-a-real-link' });

  const result = getContentEntriesForProject([danglingSession, danglingConsultation, corrupted], project.id, [project], []);

  assert.deepEqual(result, []);
  // The corrupted value itself must not have been "fixed" in place.
  assert.equal(corrupted.link, 'not-a-real-link');
});

test('getContentEntriesForProject does not mutate entries, projects or clients', () => {
  const project = makeProject({ id: 'project-target' });
  const session = makeSession({ id: 'session-1', projectId: project.id });
  const consultation = makeConsultation({ id: 'consult-1', projectId: project.id });
  const client = makeClient({ sessions: [session], consultations: [consultation] });
  const entries = [
    makeEntry({ id: 'e1', link: { type: 'project', projectId: project.id } }),
    makeEntry({ id: 'e2', link: { type: 'session', sessionId: session.id } }),
    makeEntry({ id: 'e3', sourceType: 'consultation', sourceId: consultation.id }),
  ];
  const projects = [project];
  const clients = [client];

  const entriesSnapshot = structuredClone(entries);
  const projectsSnapshot = structuredClone(projects);
  const clientsSnapshot = structuredClone(clients);

  getContentEntriesForProject(entries, project.id, projects, clients);

  assert.deepEqual(entries, entriesSnapshot);
  assert.deepEqual(projects, projectsSnapshot);
  assert.deepEqual(clients, clientsSnapshot);
});

test('the order of matching entries follows the input order, no new sort', () => {
  const project = makeProject({ id: 'project-target' });
  const e1 = makeEntry({ id: 'e1', link: { type: 'project', projectId: project.id } });
  const e2 = makeEntry({ id: 'e2', status: 'draft', link: { type: 'project', projectId: project.id } });
  const e3 = makeEntry({ id: 'e3', link: { type: 'project', projectId: 'some-other-project' } });
  const e4 = makeEntry({ id: 'e4', link: { type: 'project', projectId: project.id } });

  const result = getContentEntriesForProject([e1, e2, e3, e4], project.id, [project], []);

  assert.deepEqual(result.map((item) => item.entry.id), ['e1', 'e4']);
});

test('«Открыть в ContentINKA» does not create a draft or trigger generation', () => {
  const source = readFileSync(new URL('../src/components/sheets/SessionAndProjectSheets.tsx', import.meta.url), 'utf8');
  const sheet = source.slice(source.indexOf('function ProjectViewSheet({'), source.indexOf('function NewProjectSheet({'));

  assert.match(sheet, /onOpenContentEntry/);
  assert.doesNotMatch(sheet, /createDraftContentEntry|sendToContent|handleGenerate|\/api\/ingest/);
});

test('empty state text is shown when there is no confirmed content for the project', () => {
  const source = readFileSync(new URL('../src/components/sheets/SessionAndProjectSheets.tsx', import.meta.url), 'utf8');
  const sheet = source.slice(source.indexOf('function ProjectViewSheet({'), source.indexOf('function NewProjectSheet({'));

  assert.match(sheet, /К проекту пока не привязан готовый контент/);
  // No generation entry point leaks into the project screen.
  assert.doesNotMatch(sheet, /Сгенерировать/);
});

test('the photo count is the final selected publication set, not every source photo (8 source, 3 selected → 3)', () => {
  const photos = Array.from({ length: 8 }, (_, i) => `photo-${i}`);
  const photoIds = photos.map((_, i) => `id-${i}`);
  const contentDraft = photoIds.map((id, i) => ({
    id,
    technical_status: 'kept',
    selected: i === 1 || i === 3 || i === 5, // exactly 3 of the 8 selected
  }));

  const selection = resolveContentPhotoSelection({ photos, photoIds, contentDraft });

  assert.equal(photos.length, 8);
  assert.equal(selection.length, 3);
});

test('ProjectContentCard computes the photo count via resolveContentPhotoSelection, not entry.photos.length', () => {
  const source = readFileSync(new URL('../src/components/sheets/SessionAndProjectSheets.tsx', import.meta.url), 'utf8');
  const card = source.slice(source.indexOf('function ProjectContentCard('), source.length);

  assert.match(card, /resolveContentPhotoSelection\(\{\s*photos: entry\.photos,\s*photoIds: entry\.photoIds,\s*contentDraft: entry\.contentDraft,?\s*\}\)\.length/);
  assert.doesNotMatch(card, /entry\.photos\.length/);
});
