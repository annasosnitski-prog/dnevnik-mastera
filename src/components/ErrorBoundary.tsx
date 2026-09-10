import { Component, type CSSProperties, type ReactNode } from 'react';
import { recordErrorEntry } from '../lib/errorLog';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  // Сколько раз подряд дерево падало после «Попробовать снова». Если сбой
  // воспроизводится, повторять предложение бессмысленно — остаётся
  // перезагрузка.
  retries: number;
}

// Раньше любая необработанная ошибка рендера рвала всё дерево React без
// следа — пустой белый экран, из которого выбраться можно было только
// закрыв и заново открыв приложение. Эта граница ловит такие сбои и
// показывает понятный экран вместо белого.
//
// Два добавления к этому:
//
//  1. Падение записывается в журнал сбоев (см. lib/errorLog.ts). Журнал
//     живёт внутри дерева React — то есть ровно там, куда падение и не даёт
//     дописать. Поэтому пишем отсюда, напрямую в localStorage: иначе самый
//     важный вид сбоя, белый экран, был единственным, который не оставлял
//     о себе ни строчки.
//
//  2. Кроме «Обновить» есть «Попробовать снова» — просто перерисовать
//     дерево. Огромная часть таких падений разовые (не пришли данные,
//     сорвался таймер), и перезагрузка ради них слишком дорога: это
//     несколько секунд и потеря всего, что мастер успела набрать в форме.
const MAX_RETRIES = 2;

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, retries: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('Необработанная ошибка интерфейса:', error, info.componentStack);
    recordErrorEntry('crash', '', error);
  }

  private retry = () => {
    this.setState((prev) => ({ error: null, retries: prev.retries + 1 }));
  };

  render() {
    if (this.state.error) {
      const canRetry = this.state.retries < MAX_RETRIES;
      return (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 18,
            padding: 32,
            textAlign: 'center',
            // Через переменные темы, а не чёрным по умолчанию: в светлой теме
            // экран сбоя вспыхивал чёрным прямоугольником — в момент, когда
            // мастер и так решает, что всё сломалось.
            background: 'var(--bg, #0D0B08)',
            color: 'var(--text, #EDE4CC)',
            fontFamily: "'Inter', sans-serif",
          }}
        >
          <div style={{ fontSize: 17, fontStyle: 'italic', letterSpacing: '0.3px', maxWidth: 320 }}>
            Что-то пошло не так. Сохранённые данные никуда не делись
            {canRetry ? ' — попробуйте ещё раз.' : ' — попробуйте обновить страницу.'}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            {canRetry && (
              <button onClick={this.retry} style={BUTTON_STYLE}>
                Попробовать снова
              </button>
            )}
            <button onClick={() => window.location.reload()} style={BUTTON_STYLE}>
              Обновить
            </button>
          </div>
          <div style={{ fontSize: 12, opacity: 0.6, maxWidth: 320 }}>
            Что случилось, записано в Настройках → «Последние сбои».
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const BUTTON_STYLE: CSSProperties = {
  border: '1px solid rgba(198,161,91,0.5)',
  borderRadius: 2,
  padding: '10px 22px',
  background: 'rgba(198,161,91,0.08)',
  color: '#C6A15B',
  fontSize: 13,
  letterSpacing: '1px',
  textTransform: 'uppercase',
  cursor: 'pointer',
};
