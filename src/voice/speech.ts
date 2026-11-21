// ============================================================
// РЕЧЬ → ТЕКСТ. Сейчас — Web Speech API браузера (бесплатно, без
// сервера). Интерфейс SpeechCapture нарочно минимальный, чтобы позже
// подставить запись через MediaRecorder + Whisper, не трогая остальное:
// start() начинает слушать, stop() отдаёт итоговый текст, abort() бросает.
//
// Три особенности телефонов, под которые всё устроено:
// 1) iPhone, приложение на домашнем экране: WebKit не запоминает доступ к
//    микрофону и спрашивает его при каждом включении распознавания. Пока
//    в документе открыт поток getUserMedia, повторных вопросов нет —
//    поэтому держим один поток между нажатиями (keepMicWarm) и отпускаем
//    его после паузы без голоса, чтобы не висел значок микрофона.
// 2) Мобильные движки игнорируют continuous и сами заканчивают
//    распознавание на паузе. Пока хаб держат — тихо перезапускаем, а уже
//    распознанное копим между перезапусками.
// 3) Движок включается не мгновенно: первые слова до onstart теряются.
//    onReady сообщает, когда реально можно говорить.
// ============================================================

export interface SpeechCapture {
  start: (onInterim: (text: string) => void, onReady?: () => void) => void;
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
  maxAlternatives: number;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  onaudiostart: (() => void) | null;
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

// ---------- Тёплый микрофон: один поток на сессию приложения ----------

// Сколько держать поток после последнего отпускания хаба. Пока он открыт,
// у iPhone в углу горит оранжевая точка — это плата за «не спрашивать».
const MIC_IDLE_RELEASE_MS = 3 * 60 * 1000;

let micStream: MediaStream | null = null;
let micPending: Promise<MediaStream | null> | null = null;
let micReleaseTimer: number | null = null;
let micListenersBound = false;

function micAlive(stream: MediaStream | null): stream is MediaStream {
  return !!stream && stream.getAudioTracks().some((t) => t.readyState === 'live');
}

export function releaseMic() {
  if (micReleaseTimer != null) {
    window.clearTimeout(micReleaseTimer);
    micReleaseTimer = null;
  }
  micStream?.getTracks().forEach((t) => t.stop());
  micStream = null;
}

function bindMicListeners() {
  if (micListenersBound || typeof window === 'undefined') return;
  micListenersBound = true;
  // Ушли из приложения — отпускаем микрофон; iOS всё равно глушит его в фоне.
  window.addEventListener('pagehide', releaseMic);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') releaseMic();
  });
}

// Открывает (или переиспользует) поток микрофона. Ошибку не бросает:
// без потока распознавание всё равно попробует само спросить доступ.
// Возвращает код ошибки доступа, если пользователь отказал.
export async function keepMicWarm(): Promise<string | null> {
  if (micReleaseTimer != null) {
    window.clearTimeout(micReleaseTimer);
    micReleaseTimer = null;
  }
  if (micAlive(micStream)) return null;
  if (!navigator.mediaDevices?.getUserMedia) return null;
  bindMicListeners();
  try {
    micPending ??= navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    micStream = await micPending;
    return null;
  } catch (error) {
    const name = (error as { name?: string })?.name ?? '';
    return name === 'NotAllowedError' || name === 'SecurityError' ? 'not-allowed' : null;
  } finally {
    micPending = null;
  }
}

export function scheduleMicRelease() {
  if (micReleaseTimer != null) window.clearTimeout(micReleaseTimer);
  micReleaseTimer = window.setTimeout(releaseMic, MIC_IDLE_RELEASE_MS);
}

// ---------- Распознавание с перезапуском на паузах ----------

// После отпускания хаба ещё немного слушаем: палец часто отпускают на
// последнем слове, и без хвоста оно обрезается.
const RELEASE_TAIL_MS = 450;
// Защита от бесконечного цикла перезапусков, если движок падает сразу.
const MAX_RESTARTS = 40;

export function createWebSpeechCapture(lang = 'ru-RU'): SpeechCapture | null {
  const Ctor = recognitionCtor();
  if (!Ctor) return null;

  const banked: string[] = []; // итог прошлых сессий движка
  let finals: string[] = []; // итог текущей сессии движка (по индексу результата)
  let interim = '';
  let lastInterim = ''; // iOS иногда так и не присылает final — берём последний промежуточный
  let failure: SpeechError | null = null;
  let holding = false; // хаб удерживается — после onend перезапускаем
  let finished = false;
  let restarts = 0;
  let recognition: RecognitionLike | null = null;
  let resolveEnd: (() => void) | null = null;
  let onInterimCb: (text: string) => void = () => {};
  let onReadyCb: (() => void) | undefined;

  const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
  const sessionText = () => clean([...finals.filter(Boolean), interim].join(' '));
  const currentText = () => clean([...banked, sessionText()].join(' '));

  const bankSession = () => {
    const finalText = clean(finals.filter(Boolean).join(' '));
    const text = finalText || clean(lastInterim);
    if (text) banked.push(text);
    finals = [];
    interim = '';
    lastInterim = '';
  };

  const launch = () => {
    const r = new Ctor();
    recognition = r;
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.onstart = () => {
      onReadyCb?.();
      onReadyCb = undefined;
    };
    r.onaudiostart = r.onstart;
    r.onresult = (event) => {
      interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finals[i] = result[0].transcript;
        else interim += result[0].transcript;
      }
      if (interim) lastInterim = [...finals.filter(Boolean), interim].join(' ');
      else lastInterim = '';
      onInterimCb(currentText());
    };
    r.onerror = (event) => {
      // no-speech/aborted — не ошибка: пауза или наш собственный abort.
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      failure = new SpeechError(event.error);
      holding = false; // доступ запрещён/нет сети — перезапуск не поможет
    };
    r.onend = () => {
      if (recognition !== r) return;
      bankSession();
      if (holding && !failure && restarts < MAX_RESTARTS) {
        restarts += 1;
        window.setTimeout(() => {
          if (holding && recognition === r) {
            try {
              launch();
            } catch {
              finish();
            }
          } else if (recognition === r) finish();
        }, 120);
        return;
      }
      finish();
    };
    r.start();
  };

  const finish = () => {
    if (finished) return;
    finished = true;
    resolveEnd?.();
  };

  return {
    start(onInterim, onReady) {
      onInterimCb = onInterim;
      onReadyCb = onReady;
      holding = true;
      launch();
    },
    stop() {
      return new Promise<string>((resolve, reject) => {
        let done = false;
        resolveEnd = () => {
          if (done) return;
          done = true;
          if (failure) reject(failure);
          else resolve(currentText());
        };
        if (finished) return resolveEnd();
        window.setTimeout(() => {
          holding = false;
          try {
            recognition?.stop();
          } catch {
            finish();
          }
          // Страховка: некоторые движки не присылают onend после stop().
          window.setTimeout(() => {
            if (!finished) {
              bankSession();
              finish();
            }
          }, 2500);
        }, RELEASE_TAIL_MS);
      });
    },
    abort() {
      holding = false;
      finished = true;
      const r = recognition;
      recognition = null;
      if (r) {
        r.onresult = null;
        try {
          r.abort();
        } catch {
          /* уже остановлен */
        }
      }
    },
  };
}
