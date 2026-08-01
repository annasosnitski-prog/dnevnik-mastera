import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// Раньше любая необработанная ошибка рендера рвала всё дерево React без
// следа — пустой белый экран, из которого выбраться можно было только
// закрыв и заново открыв приложение. Эта граница ловит такие сбои и
// показывает понятный экран с кнопкой «Обновить» вместо белого экрана.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('Необработанная ошибка интерфейса:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
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
            background: '#0D0B08',
            color: '#EDE4CC',
            fontFamily: "'Inter', sans-serif",
          }}
        >
          <div style={{ fontSize: 17, fontStyle: 'italic', letterSpacing: '0.3px', maxWidth: 320 }}>
            Что-то пошло не так. Сохранённые данные никуда не делись — попробуйте обновить страницу.
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              border: '1px solid rgba(198,161,91,0.5)',
              borderRadius: 2,
              padding: '10px 22px',
              background: 'rgba(198,161,91,0.08)',
              color: '#C6A15B',
              fontSize: 13,
              letterSpacing: '1px',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            Обновить
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
