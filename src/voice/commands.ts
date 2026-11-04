// ============================================================
// РЕЕСТР ГОЛОСОВЫХ КОМАНД.
//
// Каждая команда: узнаёт своё намерение (matches) и строит черновик
// (buildDraft) — список полей, которые мастер видит в шторке подтверждения
// и может поправить. Сохранение — только по зелёной галочке, и делает его
// уже экран (TattoDiary.tsx, VOICE_EXECUTORS по commandId), тем же путём,
// что и создание из круглого меню. Здесь — ни побочных эффектов, ни UI,
// поэтому реестр покрыт тестами (tests/voiceCommands.test.mjs).
//
// Чтобы добавить команду («новый проект», «новая сессия: клиент X
// проект Y», «закрой сессию …», «сделай пост из этой сессии», навигация,
// вопросы о заживлении): новая запись в VOICE_COMMANDS + исполнитель в
// TattoDiary. Серверный разбор менять не нужно, пока хватает действий и
// сущностей из intent.ts.
// ============================================================

import type { VoiceIntent } from './intent.js';

export interface VoiceDraftField {
  key: string;
  label: string;
  value: string;
  required?: boolean;
  multiline?: boolean;
  inputType?: 'text' | 'tel';
}

export interface VoiceDraft {
  commandId: string;
  title: string;
  transcript: string;
  fields: VoiceDraftField[];
}

export interface VoiceCommand {
  id: string;
  // Пример фразы — для подсказки «что я умею».
  example: string;
  matches: (intent: VoiceIntent) => boolean;
  buildDraft: (intent: VoiceIntent) => VoiceDraft;
}

const newClient: VoiceCommand = {
  id: 'client.create',
  example: 'новый клиент Ольга Петрова, телефон …',
  matches: (intent) => intent.action === 'create' && intent.entity === 'client',
  buildDraft: (intent) => ({
    commandId: 'client.create',
    title: 'Новый клиент',
    transcript: intent.transcript,
    fields: [
      { key: 'name', label: 'Имя', value: intent.fields.name ?? '', required: true },
      { key: 'surname', label: 'Фамилия', value: intent.fields.surname ?? '' },
      { key: 'phone', label: 'Телефон', value: intent.fields.phone ?? '', inputType: 'tel' },
      { key: 'note', label: 'Заметки о клиенте', value: intent.fields.note ?? '', multiline: true },
    ],
  }),
};

export const VOICE_COMMANDS: VoiceCommand[] = [newClient];

export function findVoiceCommand(intent: VoiceIntent, commands: VoiceCommand[] = VOICE_COMMANDS): VoiceCommand | null {
  return commands.find((command) => command.matches(intent)) ?? null;
}

export function draftValues(draft: VoiceDraft): Record<string, string> {
  return Object.fromEntries(draft.fields.map((field) => [field.key, field.value]));
}

export function canConfirmDraft(draft: VoiceDraft): boolean {
  return draft.fields.every((field) => !field.required || field.value.trim().length > 0);
}
