// ============================================================
// Push-to-talk поверх SpeechCapture + разбора намерения + реестра команд.
// holdStart — палец лёг на хаб (после долгого нажатия), holdEnd — отпустил.
// На выходе — черновик (draft) для шторки подтверждения или короткое
// сообщение в пузыре над хабом. Ничего не сохраняет сам.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { createWebSpeechCapture, SpeechError, type SpeechCapture } from './speech';
import { resolveIntent } from './remoteIntent';
import { findVoiceCommand, VOICE_COMMANDS, type VoiceDraft } from './commands';
import type { VoiceContext } from './context';

export type VoicePhase = 'idle' | 'listening' | 'thinking' | 'message';

const MESSAGE_MS = 3200;
const MESSAGE_MAX_MS = 9000;

const SPEECH_ERRORS: Record<string, string> = {
  'not-allowed': 'Нет доступа к микрофону — разрешите его в настройках браузера',
  'service-not-allowed': 'Распознавание речи недоступно в этом браузере',
  network: 'Распознаванию речи нужен интернет',
  'audio-capture': 'Микрофон не найден',
};

// getContext — свежий снимок клиентов/проектов на момент фразы (через ref,
// чтобы колбэки не пересоздавались на каждое изменение данных).
// onAction — действия без сохранения данных (открыть клиента/запись):
// выполняются сразу, без шторки.
export function useVoiceCommand(
  getContext: () => VoiceContext,
  onAction: (commandId: string, values: Record<string, string>) => void,
) {
  const contextRef = useRef(getContext);
  contextRef.current = getContext;
  const actionRef = useRef(onAction);
  actionRef.current = onAction;
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<VoiceDraft | null>(null);
  const captureRef = useRef<SpeechCapture | null>(null);
  const messageTimerRef = useRef<number | null>(null);

  const showMessage = useCallback((message: string) => {
    setText(message);
    setPhase('message');
    if (messageTimerRef.current != null) window.clearTimeout(messageTimerRef.current);
    messageTimerRef.current = window.setTimeout(() => {
      messageTimerRef.current = null;
      setPhase('idle');
      setText('');
    }, Math.min(MESSAGE_MAX_MS, Math.max(MESSAGE_MS, message.length * 55)));
  }, []);

  useEffect(
    () => () => {
      captureRef.current?.abort();
      if (messageTimerRef.current != null) window.clearTimeout(messageTimerRef.current);
    },
    [],
  );

  const holdStart = useCallback(() => {
    captureRef.current?.abort();
    const capture = createWebSpeechCapture();
    if (!capture) {
      showMessage('Голосовой ввод не поддерживается этим браузером');
      return;
    }
    captureRef.current = capture;
    if (messageTimerRef.current != null) window.clearTimeout(messageTimerRef.current);
    setText('');
    setPhase('listening');
    try {
      navigator.vibrate?.(15);
    } catch {
      /* не все платформы умеют вибрацию */
    }
    try {
      capture.start((interim) => setText(interim));
    } catch {
      captureRef.current = null;
      showMessage('Не удалось включить микрофон');
    }
  }, [showMessage]);

  const holdEnd = useCallback(async () => {
    const capture = captureRef.current;
    if (!capture) return;
    captureRef.current = null;
    setPhase('thinking');
    let transcript = '';
    try {
      transcript = await capture.stop();
    } catch (error) {
      const code = error instanceof SpeechError ? error.code : '';
      showMessage(SPEECH_ERRORS[code] ?? 'Не получилось распознать речь');
      return;
    }
    if (!transcript) {
      showMessage('Не расслышала — держите кнопку и говорите');
      return;
    }
    setText(transcript);
    const ctx = contextRef.current();
    const intent = await resolveIntent(transcript, ctx.today);
    const command = findVoiceCommand(intent);
    if (!command) {
      showMessage(`Не поняла. Например: «${VOICE_COMMANDS.slice(0, 4).map((c) => c.example).join('», «')}»`);
      return;
    }
    const result = command.build(intent, ctx);
    if (result.type === 'message') {
      showMessage(result.text);
      return;
    }
    if (result.type === 'action') {
      actionRef.current(result.commandId, result.values);
      if (result.message) showMessage(result.message);
      else {
        setPhase('idle');
        setText('');
      }
      return;
    }
    setPhase('idle');
    setText('');
    setDraft(result.draft);
  }, [showMessage]);

  return { phase, text, draft, setDraft, holdStart, holdEnd };
}
