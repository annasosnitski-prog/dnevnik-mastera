// ============================================================
// Push-to-talk поверх SpeechCapture + разбора намерения + реестра команд.
// holdStart — палец лёг на хаб (после долгого нажатия), holdEnd — отпустил.
// На выходе — черновик (draft) для шторки подтверждения или короткое
// сообщение в пузыре над хабом. Ничего не сохраняет сам.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { createWebSpeechCapture, keepMicWarm, scheduleMicRelease, SpeechError, type SpeechCapture } from './speech';
import { resolveIntent } from './remoteIntent';
import { findVoiceCommand, VOICE_COMMANDS, type VoiceDraft } from './commands';
import type { VoiceContext } from './context';

export type VoicePhase = 'idle' | 'listening' | 'thinking' | 'message';

const MESSAGE_MS = 3200;
const MESSAGE_MAX_MS = 9000;
// Удержание короче этого — человек не успел ничего сказать.
const MIN_SPEECH_MS = 900;
// Страховка, если отпускание пальца потерялось: сами заканчиваем запись.
const MAX_LISTEN_MS = 90_000;

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
  const phaseRef = useRef<VoicePhase>('idle');
  phaseRef.current = phase;
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
      if (maxTimerRef.current != null) window.clearTimeout(maxTimerRef.current);
    },
    [],
  );

  // holdIdRef отличает текущее удержание от прошлых: пока ждём доступ к
  // микрофону, палец могли уже отпустить и нажать снова.
  const holdIdRef = useRef(0);
  const holdStartedAtRef = useRef(0);
  const [ready, setReady] = useState(false);
  const maxTimerRef = useRef<number | null>(null);
  const holdEndRef = useRef<() => void>(() => {});

  const clearMaxTimer = () => {
    if (maxTimerRef.current != null) {
      window.clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
  };

  const holdStart = useCallback(async () => {
    captureRef.current?.abort();
    captureRef.current = null;
    const holdId = ++holdIdRef.current;
    holdStartedAtRef.current = Date.now();
    if (messageTimerRef.current != null) window.clearTimeout(messageTimerRef.current);
    setText('');
    setReady(false);
    setPhase('listening');
    // Один поток микрофона на всю сессию приложения — иначе iPhone
    // спрашивает разрешение при каждом удержании.
    const denied = await keepMicWarm();
    if (holdId !== holdIdRef.current) return; // уже отпустили — holdEnd разобрался
    if (denied) {
      holdIdRef.current += 1;
      showMessage(SPEECH_ERRORS['not-allowed']);
      return;
    }
    const capture = createWebSpeechCapture();
    if (!capture) {
      holdIdRef.current += 1;
      showMessage('Голосовой ввод не поддерживается этим браузером');
      return;
    }
    captureRef.current = capture;
    try {
      capture.start(
        (interim) => setText(interim),
        () => {
          if (holdId !== holdIdRef.current) return;
          setReady(true);
          try {
            navigator.vibrate?.(15);
          } catch {
            /* не все платформы умеют вибрацию */
          }
        },
      );
    } catch {
      captureRef.current = null;
      holdIdRef.current += 1;
      showMessage('Не удалось включить микрофон');
      return;
    }
    clearMaxTimer();
    maxTimerRef.current = window.setTimeout(() => holdEndRef.current(), MAX_LISTEN_MS);
  }, [showMessage]);

  const holdEnd = useCallback(async () => {
    clearMaxTimer();
    const capture = captureRef.current;
    captureRef.current = null;
    const heldMs = Date.now() - holdStartedAtRef.current;
    holdIdRef.current += 1;
    setReady(false);
    scheduleMicRelease();
    if (!capture) {
      // Отпустили, пока ещё включался микрофон (или ждали разрешения).
      if (phaseRef.current === 'listening') showMessage('Держите кнопку, пока говорите');
      return;
    }
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
      showMessage(
        heldMs < MIN_SPEECH_MS
          ? 'Держите кнопку, пока говорите'
          : 'Не расслышала — говорите ближе к телефону, кнопку держите до конца фразы',
      );
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

  holdEndRef.current = holdEnd;

  return { phase, ready, text, draft, setDraft, holdStart, holdEnd };
}
