// ============================================================
// РЕЧЬ → ТЕКСТ. Сейчас — Web Speech API браузера (бесплатно, без
// сервера). Интерфейс SpeechCapture нарочно минимальный, чтобы позже
// подставить запись через MediaRecorder + Whisper, не трогая остальное:
// start() начинает слушать, stop() отдаёт итоговый текст, abort() бросает.
// ============================================================

export interface SpeechCapture {
  start: (onInterim: (text: string) => void) => void;
  stop: () => Promise<string>;
  abort: () => void;
}

// Минимум типов Web Speech API — в lib.dom их нет.
interface RecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<RecognitionResultLike>;
}
interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type RecognitionCtor = new () => RecognitionLike;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechSupported(): boolean {
  return recognitionCtor() !== null;
}

export class SpeechError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export function createWebSpeechCapture(lang = 'ru-RU'): SpeechCapture | null {
  const Ctor = recognitionCtor();
  if (!Ctor) return null;
  const recognition = new Ctor();
  recognition.lang = lang;
  recognition.continuous = true;
  recognition.interimResults = true;

  const finals: string[] = [];
  let interim = '';
  let failure: SpeechError | null = null;
  let ended = false;
  let resolveEnd: (() => void) | null = null;

  recognition.onresult = (event) => {
    interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) finals[i] = result[0].transcript;
      else interim += result[0].transcript;
    }
    onInterimCb(currentText());
  };
  recognition.onerror = (event) => {
    // no-speech/aborted — не ошибка для пользователя, просто пустой текст.
    if (event.error !== 'no-speech' && event.error !== 'aborted') failure = new SpeechError(event.error);
  };
  recognition.onend = () => {
    ended = true;
    resolveEnd?.();
  };

  let onInterimCb: (text: string) => void = () => {};
  const currentText = () => [...finals.filter(Boolean), interim].join(' ').replace(/\s+/g, ' ').trim();

  return {
    start(onInterim) {
      onInterimCb = onInterim;
      recognition.start();
    },
    stop() {
      return new Promise<string>((resolve, reject) => {
        const finish = () => (failure ? reject(failure) : resolve(currentText()));
        if (ended) return finish();
        resolveEnd = finish;
        recognition.stop();
        // Страховка: некоторые движки не присылают onend после stop().
        window.setTimeout(finish, 2500);
      });
    },
    abort() {
      recognition.onresult = null;
      recognition.abort();
    },
  };
}
