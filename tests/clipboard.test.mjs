import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  COPY_FEEDBACK_RESET_MS,
  copyTextToClipboard,
  createCopyFeedbackController,
} from '../.test-dist/src/lib/clipboard.js';

function createFakeDocument(copyResult = true) {
  const state = {
    appended: false,
    removed: false,
    selected: false,
    selectionStart: null,
    selectionEnd: null,
    execCommands: [],
    restoredFocus: false,
    restoredRanges: [],
    textareaValue: '',
  };
  const savedRange = { id: 'saved-range' };
  const selection = {
    rangeCount: 1,
    getRangeAt() {
      return { cloneRange: () => savedRange };
    },
    removeAllRanges() {
      state.restoredRanges = [];
    },
    addRange(range) {
      state.restoredRanges.push(range);
    },
  };
  const textarea = {
    value: '',
    tabIndex: 0,
    style: {},
    setAttribute() {},
    focus() {},
    select() {
      state.selected = true;
    },
    setSelectionRange(start, end) {
      state.selectionStart = start;
      state.selectionEnd = end;
    },
    remove() {
      state.removed = true;
    },
  };
  const document = {
    activeElement: {
      focus() {
        state.restoredFocus = true;
      },
    },
    body: {
      appendChild(node) {
        state.appended = true;
        state.textareaValue = node.value;
      },
    },
    createElement(tagName) {
      assert.equal(tagName, 'textarea');
      return textarea;
    },
    execCommand(command) {
      state.execCommands.push(command);
      return copyResult;
    },
    getSelection() {
      return selection;
    },
  };

  return { document, state, textarea, savedRange };
}

function createFakeTimers() {
  let nextId = 1;
  const callbacks = new Map();
  const delays = new Map();
  const cancelled = [];
  return {
    callbacks,
    delays,
    cancelled,
    setTimer(callback, delay) {
      const id = nextId;
      nextId += 1;
      callbacks.set(id, callback);
      delays.set(id, delay);
      return id;
    },
    clearTimer(id) {
      callbacks.delete(id);
      cancelled.push(id);
    },
  };
}

test('copies only trimmed textDraft through navigator.clipboard without mutating the source', async () => {
  const sourceText = '  Первая строка\n\nВторая строка  ';
  const writes = [];
  const fallback = createFakeDocument();

  const copied = await copyTextToClipboard(sourceText, {
    clipboard: { writeText: async (text) => writes.push(text) },
    document: fallback.document,
  });

  assert.equal(copied, true);
  assert.deepEqual(writes, ['Первая строка\n\nВторая строка']);
  assert.equal(sourceText, '  Первая строка\n\nВторая строка  ');
  assert.equal(fallback.state.appended, false);
});

test('does not call Clipboard API or fallback for an empty textDraft', async () => {
  let clipboardCalls = 0;
  const fallback = createFakeDocument();

  const copied = await copyTextToClipboard('  \n  ', {
    clipboard: {
      writeText: async () => {
        clipboardCalls += 1;
      },
    },
    document: fallback.document,
  });

  assert.equal(copied, false);
  assert.equal(clipboardCalls, 0);
  assert.equal(fallback.state.appended, false);
});

test('uses a hidden textarea fallback and restores focus and selection without navigator.clipboard', async () => {
  const fallback = createFakeDocument();

  const copied = await copyTextToClipboard('  Точный текст  ', { document: fallback.document });

  assert.equal(copied, true);
  assert.equal(fallback.state.textareaValue, 'Точный текст');
  assert.equal(fallback.state.selected, true);
  assert.equal(fallback.textarea.style.position, 'fixed');
  assert.equal(fallback.textarea.style.top, '-9999px');
  assert.equal(fallback.textarea.style.opacity, '0');
  assert.equal(fallback.state.selectionStart, 0);
  assert.equal(fallback.state.selectionEnd, 'Точный текст'.length);
  assert.deepEqual(fallback.state.execCommands, ['copy']);
  assert.equal(fallback.state.removed, true);
  assert.equal(fallback.state.restoredFocus, true);
  assert.deepEqual(fallback.state.restoredRanges, [fallback.savedRange]);
});

test('falls back to a textarea when navigator.clipboard.writeText rejects', async () => {
  let clipboardCalls = 0;
  const fallback = createFakeDocument();

  const copied = await copyTextToClipboard('Текст', {
    clipboard: {
      writeText: async () => {
        clipboardCalls += 1;
        throw new Error('clipboard unavailable');
      },
    },
    document: fallback.document,
  });

  assert.equal(copied, true);
  assert.equal(clipboardCalls, 1);
  assert.deepEqual(fallback.state.execCommands, ['copy']);
});

test('keeps success and error feedback independent for different entries', () => {
  const timers = createFakeTimers();
  let feedbackByEntry = {};
  const controller = createCopyFeedbackController({
    onChange: (next) => {
      feedbackByEntry = next;
    },
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });

  const firstAttempt = controller.begin('entry-1');
  controller.finish('entry-1', firstAttempt, 'success');
  const secondAttempt = controller.begin('entry-2');
  controller.finish('entry-2', secondAttempt, 'error');

  assert.deepEqual(feedbackByEntry, { 'entry-1': 'success', 'entry-2': 'error' });
});

test('resets feedback after the timer and restarts the timer on repeated copy', () => {
  const timers = createFakeTimers();
  let feedbackByEntry = {};
  const controller = createCopyFeedbackController({
    onChange: (next) => {
      feedbackByEntry = next;
    },
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });

  const firstAttempt = controller.begin('entry-1');
  controller.finish('entry-1', firstAttempt, 'success');
  const firstTimerId = 1;
  assert.equal(timers.delays.get(firstTimerId), COPY_FEEDBACK_RESET_MS);

  const secondAttempt = controller.begin('entry-1');
  assert.deepEqual(feedbackByEntry, {});
  assert.equal(timers.cancelled.includes(firstTimerId), true);
  controller.finish('entry-1', secondAttempt, 'success');
  const secondTimerId = 2;
  assert.equal(timers.delays.get(secondTimerId), 1800);

  timers.callbacks.get(secondTimerId)();
  assert.deepEqual(feedbackByEntry, {});
});

test('clears entry timers on deletion and all timers on dispose', () => {
  const timers = createFakeTimers();
  const controller = createCopyFeedbackController({
    onChange: () => undefined,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });

  const firstAttempt = controller.begin('entry-1');
  controller.finish('entry-1', firstAttempt, 'success');
  controller.clear('entry-1');
  assert.equal(timers.cancelled.includes(1), true);

  const secondAttempt = controller.begin('entry-2');
  controller.finish('entry-2', secondAttempt, 'error');
  controller.dispose();
  assert.equal(timers.cancelled.includes(2), true);
});

test('renders an accessible disabled copy button and keeps copy errors local', () => {
  const source = readFileSync(new URL('../src/components/TattoDiary.tsx', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  const copyImplementation = source.slice(source.indexOf('const copyContentDraft ='), source.indexOf('const visibleEntries'));

  assert.match(source, /type="button"\s+className=\{`content-action-button content-copy-action/);
  assert.match(source, /aria-label="Копировать текст публикации"/);
  assert.match(source, /disabled=\{!entry\.textDraft\.trim\(\)\}/);
  assert.match(source, /Копировать текст/);
  assert.match(source, /Скопировано/);
  assert.match(source, /Не удалось скопировать/);
  assert.match(copyImplementation, /copyTextToClipboard\(entry\.textDraft\)/);
  assert.match(copyImplementation, /finish\(entry\.id, attempt, 'error'\)/);
  assert.doesNotMatch(copyImplementation, /setError\(/);
  assert.match(source, /copyFeedbackController\.clear\(entryId\)/);
  assert.match(source, /copyFeedbackController\.dispose\(\)/);
  assert.match(styles, /\.content-copy-action:active:not\(:disabled\)/);
  assert.match(styles, /\.content-copy-action\.is-success/);
  assert.match(styles, /\.content-copy-action\.is-error/);
});
