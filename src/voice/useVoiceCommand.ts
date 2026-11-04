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

export type VoicePhase = 'idle' | 'listening' | 'thinking' | 'message';

const MESSAGE_MS = 3200;

const SPEECH_ERRORS: Record<string, string> = {
  'not-allowed': 'Нет доступа к микрофону — разрешите его в настройках браузера',
  'service-not-allowed': 'Распознавание речи недоступно в этом браузере',
  network: 'Распознаванию речи нужен интернет',
  'audio-capture': 'Микрофон не найден',
};

export function useVoiceCommand() {
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
    }, MESSAGE_MS);
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
    const intent = await resolveIntent(transcript);
    const command = findVoiceCommand(intent);
    if (!command) {
      showMessage(`Пока умею: «${VOICE_COMMANDS.map((c) => c.example).join('», «')}»`);
      return;
    }
    setPhase('idle');
    setText('');
    setDraft(command.buildDraft(intent));
  }, [showMessage]);

  return { phase, text, draft, setDraft, holdStart, holdEnd };
}
