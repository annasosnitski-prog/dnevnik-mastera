import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  DOMINANT_VISUAL_STORY_INSTRUCTION,
  buildInitialContentInstruction,
} from '../.test-dist/src/lib/contentPrompt.js';

const diary = readFileSync(new URL('../src/components/TattoDiary.tsx', import.meta.url), 'utf8');

test('initial content prompt chooses one dominant visual story instead of describing every photo', () => {
  const prompt = buildInitialContentInstruction();

  assert.match(prompt, /проанализируй все фотографии/i);
  assert.match(prompt, /один доминирующий визуальный сюжет/i);
  assert.match(prompt, /одного главного визуального акцента/i);
  assert.match(prompt, /одной эмоциональной линии и одной истории/i);
  assert.match(prompt, /не перечисляй объекты/i);
  assert.match(prompt, /не пытайся описать всё/i);
  assert.doesNotMatch(prompt, /используй все фотографии/i);
});

test('initial content prompt may ignore secondary and contradictory frames', () => {
  assert.match(DOMINANT_VISUAL_STORY_INSTRUCTION, /поддерживающий контекст/i);
  assert.match(DOMINANT_VISUAL_STORY_INSTRUCTION, /наиболее сильную линию/i);
  assert.match(DOMINANT_VISUAL_STORY_INSTRUCTION, /второстепенные[и\s]+противоречащие ей кадры игнорируй/i);
});

test('initial content prompt keeps the selected archetype instruction and leaves refresh wiring unchanged', () => {
  const archetype = 'открой материал в архетипе Творец';
  const prompt = buildInitialContentInstruction(archetype);
  assert.ok(prompt.startsWith(DOMINANT_VISUAL_STORY_INSTRUCTION));
  assert.ok(prompt.endsWith(archetype));

  const generation = diary.slice(diary.indexOf('const handleGenerate = async'), diary.indexOf('const regenerate = async'));
  const refresh = diary.slice(diary.indexOf('const regenerate = async'), diary.indexOf('const copyContentDraft = async'));
  assert.match(generation, /photos\.length > 0[\s\S]*buildInitialContentInstruction\(selectedTextArchetype\?\.instruction\)/);
  assert.match(generation, /: selectedTextArchetype\?\.instruction/);
  assert.doesNotMatch(refresh, /buildInitialContentInstruction/);
  assert.match(refresh, /const masterInstruction = instruction \|\| primaryTextArchetype\?\.instruction/);
});
