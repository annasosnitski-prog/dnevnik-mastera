import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/components/TattoDiary.tsx', import.meta.url), 'utf8');
// NewSessionSheet/ProjectSessionPickerSheet/NewConsultationSheet/ProjectViewSheet/
// NewProjectSheet вынесены в отдельный модуль (PR 6 рефакторинга) — их function
// definitions читаются оттуда; JSX usage (<ProjectSessionPickerSheet ...>) и
// корневые обработчики остаются в TattoDiary.tsx.
const sheetsSource = readFileSync(new URL('../src/components/sheets/SessionAndProjectSheets.tsx', import.meta.url), 'utf8');
const sheet = source.slice(source.indexOf('function ContentLinkPickerSheet('), source.indexOf('// ===================== CALENDAR SHEET ====================='));
const screen = source.slice(source.indexOf('function ContentINKAScreen({'), source.indexOf('function ContentPanel({'));
const handleAddProject = source.slice(source.indexOf('const handleAddProject = (data'), source.indexOf('const handleAddProjectSession ='));
const handleAddProjectSession = source.slice(source.indexOf('const handleAddProjectSession ='), source.indexOf('const saveSessionFromNewSessionSheet ='));
const saveSessionFromNewSessionSheet = source.slice(source.indexOf('const saveSessionFromNewSessionSheet ='), source.indexOf('const openCreateProjectForContentLink ='));
const openCallbacks = source.slice(source.indexOf('const openCreateProjectForContentLink ='), source.indexOf('const migrateRecordsIntoProjects ='));
const projectSessionPickerSheetFn = sheetsSource.slice(sheetsSource.indexOf('export function ProjectSessionPickerSheet('), sheetsSource.indexOf('export function NewConsultationSheet('));
const projectSessionPickerSheetUsage = source.slice(source.indexOf('<ProjectSessionPickerSheet'), source.indexOf('<NewConsultationSheet'));

test('the intermediate "choice" step is gone — one sheet, no big-card choice screen', () => {
  assert.doesNotMatch(sheet, /'choice'/);
  assert.doesNotMatch(sheet, /Куда сохранить контент\?/);
  assert.doesNotMatch(sheet, /Выбрать проект/);
  assert.doesNotMatch(sheet, /Выбрать сессию/);
  assert.doesNotMatch(sheet, /назад/);
  assert.match(sheet, /Сохранить в…/);
});

test('project and session are switched by two compact tabs, not a back button', () => {
  assert.match(sheet, /target: 'project' \| 'session'/);
  assert.match(sheet, /onTargetChange: \(target: 'project' \| 'session'\) => void/);
  assert.match(sheet, /role="tablist"/);
  assert.match(sheet, /role="tab"/);
  assert.match(sheet, /aria-selected=\{target === 'project'\}/);
  assert.match(sheet, /aria-selected=\{target === 'session'\}/);
  assert.match(sheet, />\s*Проект\s*<\/button>/);
  assert.match(sheet, />\s*Сессия\s*<\/button>/);
  assert.match(sheet, /onClick=\{\(\) => onTargetChange\('project'\)\}/);
  assert.match(sheet, /onClick=\{\(\) => onTargetChange\('session'\)\}/);
});

test('an existing project is picked with a single tap and closes the sheet', () => {
  const projectTab = sheet.slice(sheet.indexOf("target === 'project' ? ("), sheet.indexOf('sessionOptions.length === 0 ? ('));
  assert.match(projectTab, /onPick\(\{ type: 'project', projectId: opt\.project\.id \}\)/);
  assert.match(projectTab, /onClose\(\)/);
  assert.match(projectTab, /clientNameFor\(clients, opt\.project\.clientId\) \?\? 'Мастерская'/);
});

test('an existing session is picked with a single tap and closes the sheet', () => {
  const sessionTab = sheet.slice(sheet.indexOf('sessionOptions.map((opt, i)'), sheet.length);
  assert.match(sessionTab, /onPick\(\{ type: 'session', sessionId: opt\.session\.id \}\)/);
  assert.match(sessionTab, /onClose\(\)/);
});

test('an empty project list offers "Создать проект" instead of a dead end', () => {
  const projectEmpty = sheet.slice(sheet.indexOf('projectOptions.length === 0 ? ('), sheet.indexOf('projectOptions.map((opt, i)'));
  assert.match(projectEmpty, /Пока нет проектов\./);
  assert.match(projectEmpty, /createPrimaryButton\('Создать проект', onCreateProject\)/);
});

test('an empty session list offers "Создать сессию" instead of a dead end', () => {
  const sessionEmpty = sheet.slice(sheet.indexOf("sessionOptions.length === 0 ? ("), sheet.indexOf('sessionOptions.map((opt, i)'));
  assert.match(sessionEmpty, /Пока нет сессий\./);
  assert.match(sessionEmpty, /createPrimaryButton\('Создать сессию', onCreateSession\)/);
});

test('a non-empty list still keeps "+ Создать проект/сессию" reachable at the bottom', () => {
  assert.match(sheet, /createLinkText\('Создать проект', onCreateProject\)/);
  assert.match(sheet, /createLinkText\('Создать сессию', onCreateSession\)/);
});

test('a created project automatically links to the pending ContentEntry (no re-search needed)', () => {
  assert.match(handleAddProject, /pendingContentLinkRef\.current/);
  assert.match(handleAddProject, /linkContentEntryTo\(pendingContentLinkRef\.current\.entryId, \{ type: 'project', projectId: newProjectId \}\)/);
  assert.match(handleAddProject, /pendingContentLinkRef\.current = null/);
  // No project-only chain, when the target is 'session', continues into
  // session creation instead of ending the flow — no dead end either.
  assert.match(handleAddProject, /setSessionTargetProjectId\(newProjectId\)/);
  assert.match(handleAddProject, /setShowNewSessionForm\(true\)/);
});

test('a created studio (project-only) session automatically links to the pending ContentEntry', () => {
  assert.match(handleAddProjectSession, /!editSession && pendingContentLinkRef\.current\?\.target === 'session'/);
  assert.match(handleAddProjectSession, /linkContentEntryTo\(pendingContentLinkRef\.current\.entryId, \{ type: 'session', sessionId \}\)/);
  assert.match(handleAddProjectSession, /pendingContentLinkRef\.current = null/);
});

test('creation reuses the existing Project/Session save handlers — no second form or data source', () => {
  assert.match(openCallbacks, /setShowNewProjectForm\(true\)/);
  assert.match(openCallbacks, /setShowProjectSessionPicker\(true\)/);
  assert.doesNotMatch(openCallbacks, /saveProject\(/);
  assert.doesNotMatch(openCallbacks, /saveClient\(/);
  // The same NewProjectSheet/ProjectSessionPickerSheet+NewSessionSheet
  // instances already wired to handleAddProject/handleAddProjectSession —
  // not a duplicate mounted only for content-link creation.
  assert.match(source, /onAdd=\{handleAddProject\}/);
  assert.match(source, /handleAddProjectSession\(sessionTargetProjectId, data\)/);
});

test('"Оставить без привязки" saves link: null and closes the sheet', () => {
  const leaveUnlinked = sheet.slice(sheet.indexOf('Оставить без привязки') - 400, sheet.indexOf('Оставить без привязки') + 50);
  assert.match(leaveUnlinked, /onPick\(null\)/);
  assert.match(leaveUnlinked, /onClose\(\)/);
});

test('cancelling project/session creation does not save anything and just closes — no forced reopen of the picker', () => {
  const newProjectSheetBlock = source.slice(source.indexOf('<NewProjectSheet'), source.indexOf('</NewProjectSheet') + 1 || source.indexOf('/>', source.indexOf('<NewProjectSheet')));
  const projectSessionPickerBlock = source.slice(source.indexOf('<ProjectSessionPickerSheet'), source.indexOf('<NewConsultationSheet'));

  for (const block of [newProjectSheetBlock, projectSessionPickerBlock]) {
    // Cancelling just drops the pending chain — it used to force the
    // "Сохранить в…" sheet back open (setReopenContentLinkPicker), which kept
    // resurfacing it even after the master had already moved to an unrelated
    // tab/filter, making it look like the sheet never closed.
    assert.match(block, /pendingContentLinkRef\.current = null/);
    assert.doesNotMatch(block, /setReopenContentLinkPicker/);
    assert.doesNotMatch(block.slice(0, block.indexOf('onClose=') + 400), /saveProject\(/);
  }
  assert.doesNotMatch(source, /setReopenContentLinkPicker|reopenLinkPickerEntryId|reopenContentLinkPicker/);
});

test('opening a create-project/create-session flow closes ContentLinkPickerSheet first — no two bottom sheets at once', () => {
  const onCreateProjectWiring = screen.slice(screen.indexOf('onCreateProject={() => {'), screen.indexOf('onCreateSession={() => {'));
  const onCreateSessionWiring = screen.slice(screen.indexOf('onCreateSession={() => {'), screen.indexOf('/>\n    </div>\n  );\n}'));

  assert.ok(onCreateProjectWiring.indexOf('setLinkPickerEntryId(null)') < onCreateProjectWiring.indexOf('onCreateProjectForLink('));
  assert.ok(onCreateSessionWiring.indexOf('setLinkPickerEntryId(null)') < onCreateSessionWiring.indexOf('onCreateSessionForLink('));
});

test('the initial tab is computed from resolveContentEntryLink, not just explicit entry.link', () => {
  assert.match(screen, /const openLinkPicker = \(entryId: string\) => \{/);
  const openLinkPickerBody = screen.slice(screen.indexOf('const openLinkPicker = (entryId: string) => {'), screen.indexOf('const copyFeedbackController ='));
  assert.match(openLinkPickerBody, /resolveContentEntryLink\(candidate, projects, clients\)/);
  assert.match(openLinkPickerBody, /setLinkPickerTarget\(resolved\?\.kind === 'session' \? 'session' : 'project'\)/);
});

test('a sourceType=session entry with no explicit link resolves to kind "session" (openLinkPicker opens the Session tab)', async () => {
  const { resolveContentEntryLink } = await import('../.test-dist/src/lib/contentLink.js');
  const project = { id: 'p1', clientId: 'client-1', sessions: [] };
  const session = { id: 's1', projectId: 'p1' };
  const client = { id: 'client-1', sessions: [session], consultations: [] };
  const entry = { sourceType: 'session', sourceId: 's1', clientId: 'client-1' };

  const resolved = resolveContentEntryLink(entry, [project], [client]);
  assert.equal(resolved.kind, 'session');
});

test('creating a session for a CLIENT ContentEntry lists that client\'s own projects, not clientless ones', () => {
  assert.match(projectSessionPickerSheetFn, /clientId \? projects\.filter\(\(p\) => p\.clientId === clientId\) : projects\.filter\(\(p\) => !p\.clientId\)/);
  assert.match(projectSessionPickerSheetFn, /Пока нет проектов у этого клиента/);
  assert.match(projectSessionPickerSheetUsage, /clientId=\{pendingContentLinkRef\.current\?\.preferredClientId \?\? null\}/);
});

test('creating a project from the empty Session tab preserves the entry\'s preferredClientId, not null', () => {
  const onCreateProjectWiring = projectSessionPickerSheetUsage.slice(projectSessionPickerSheetUsage.indexOf('onCreateProject={'));
  assert.match(onCreateProjectWiring, /setNewProjectClientId\(pendingContentLinkRef\.current\?\.preferredClientId \?\? null\)/);
});

test('saveSessionFromNewSessionSheet routes a CLIENT content-link session into client.sessions via upsertClientSession, not Project.sessions', () => {
  assert.match(saveSessionFromNewSessionSheet, /const contentLinkClientId = pendingContentLinkRef\.current\?\.preferredClientId/);
  const clientBranch = saveSessionFromNewSessionSheet.slice(
    saveSessionFromNewSessionSheet.indexOf('if (sessionTargetProjectId && contentLinkClientId)'),
    saveSessionFromNewSessionSheet.indexOf('if (sessionTargetProjectId) {'),
  );
  assert.match(clientBranch, /upsertClientSession\(\s*client,\s*\{ \.\.\.data, projectId: sessionTargetProjectId \},\s*editSession\?\.id \?\? null,\s*\)/);
  assert.match(clientBranch, /saveClient\(updatedClient\)/);
  assert.match(clientBranch, /linkContentEntryTo\(pendingContentLinkRef\.current\.entryId, \{ type: 'session', sessionId \}\)/);
  assert.doesNotMatch(clientBranch, /upsertProjectSession|saveProject\(/);
});

test('saveSessionFromNewSessionSheet falls back to Project.sessions (handleAddProjectSession) for a STUDIO content-link session', () => {
  const studioBranch = saveSessionFromNewSessionSheet.slice(
    saveSessionFromNewSessionSheet.indexOf('if (sessionTargetProjectId) {\n      handleAddProjectSession'),
    saveSessionFromNewSessionSheet.indexOf('handleAddSession(data);'),
  );
  assert.match(studioBranch, /handleAddProjectSession\(sessionTargetProjectId, data\)/);
  assert.match(studioBranch, /closeNewSession\(\)/);
});

test('a plain client-tab session (no content-link chain) still falls through to handleAddSession', () => {
  assert.match(saveSessionFromNewSessionSheet, /handleAddSession\(data\);\s*\};/);
});

test('the NewSessionSheet form itself is not duplicated — onAdd delegates to the single orchestration function', () => {
  assert.match(source, /onAdd=\{saveSessionFromNewSessionSheet\}/);
  const newSessionSheetSource = sheetsSource.slice(sheetsSource.indexOf('export function NewSessionSheet('), sheetsSource.indexOf('export function ProjectSessionPickerSheet('));
  assert.doesNotMatch(newSessionSheetSource, /upsertClientSession|upsertProjectSession|pendingContentLinkRef/);
});

// Edge case: NewProjectSheet lets the master switch the project's client
// (or "Мастерская") right in the create-project form. The chain's owner must
// follow that FINAL choice (data.clientId), not the original entry.clientId
// captured when "Создать сессию" was first tapped — otherwise a session
// could land on the wrong client, or a studio project could be routed
// through client.sessions with a stale clientId.
const sessionChainBranch = handleAddProject.slice(
  handleAddProject.indexOf("} else {\n          // target === 'session'"),
  handleAddProject.indexOf('return;\n        }'),
);

test('switching the project to a NEW client mid-creation updates the chain\'s owner to that client (not the original entry.clientId)', () => {
  // The fix: preferredClientId is overwritten with the just-saved
  // data.clientId right before opening NewSessionSheet.
  assert.match(
    sessionChainBranch,
    /pendingContentLinkRef\.current = \{ \.\.\.pendingContentLinkRef\.current, preferredClientId: data\.clientId \}/,
  );
  // This must happen before the session form opens, so
  // saveSessionFromNewSessionSheet reads the updated owner, not the stale one.
  assert.ok(
    sessionChainBranch.indexOf('preferredClientId: data.clientId') <
      sessionChainBranch.indexOf('setShowNewSessionForm(true)'),
  );
  // saveSessionFromNewSessionSheet always re-reads preferredClientId from the
  // ref at save time (not a value captured earlier) — so the updated owner
  // set above is exactly what routes the session into client B's sessions.
  assert.match(saveSessionFromNewSessionSheet, /const contentLinkClientId = pendingContentLinkRef\.current\?\.preferredClientId/);
});

test('switching the project to "Мастерская" (clientId: null) mid-creation routes the session into Project.sessions, not client.sessions', () => {
  // data.clientId can be null when the master picks "Мастерская (без
  // клиента)" in NewProjectSheet — the same assignment applies unconditionally,
  // so preferredClientId becomes null and saveSessionFromNewSessionSheet's
  // `contentLinkClientId` guard (`sessionTargetProjectId && contentLinkClientId`)
  // is falsy, falling through to the Project.sessions branch below it.
  assert.match(sessionChainBranch, /preferredClientId: data\.clientId/);
  assert.doesNotMatch(sessionChainBranch, /preferredClientId: data\.clientId \?\? /);
  const studioBranch = saveSessionFromNewSessionSheet.slice(
    saveSessionFromNewSessionSheet.indexOf('if (sessionTargetProjectId) {\n      handleAddProjectSession'),
    saveSessionFromNewSessionSheet.indexOf('handleAddSession(data);'),
  );
  assert.match(studioBranch, /handleAddProjectSession\(sessionTargetProjectId, data\)/);
});

test('the session\'s projectId is always the actually-created project\'s id (newProjectId), passed through as sessionTargetProjectId', () => {
  assert.match(sessionChainBranch, /setSessionTargetProjectId\(newProjectId\)/);
  // Both save branches use sessionTargetProjectId as the session's projectId —
  // client.sessions via upsertClientSession's { ...data, projectId: sessionTargetProjectId },
  // and Project.sessions via handleAddProjectSession(sessionTargetProjectId, data)
  // (which itself passes projectId through to upsertProjectSession).
  assert.match(saveSessionFromNewSessionSheet, /\{ \.\.\.data, projectId: sessionTargetProjectId \}/);
  assert.match(saveSessionFromNewSessionSheet, /handleAddProjectSession\(sessionTargetProjectId, data\)/);
  assert.match(handleAddProjectSession, /upsertProjectSession\(p, \{ \.\.\.data, projectId \}, editSession\?\.id \?\? null\)/);
});

test('the existing pick-an-existing-project scenario is untouched by this fix', () => {
  const onPickWiring = projectSessionPickerSheetUsage.slice(
    projectSessionPickerSheetUsage.indexOf('onPick={(project) => {'),
    projectSessionPickerSheetUsage.indexOf('onCreateProject={'),
  );
  assert.doesNotMatch(onPickWiring, /preferredClientId/);
  assert.match(onPickWiring, /setSessionTargetProjectId\(project\.id\)/);
});
