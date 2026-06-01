import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import ConfirmDialog from '../components/ConfirmDialog';

const ConfirmContext = createContext(null);

const defaultLabels = {
  confirmLabel: 'Подтвердить',
  cancelLabel: 'Отмена',
};

export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null);

  const close = useCallback((result) => {
    setDialog((current) => {
      current?.resolve?.(result);
      return null;
    });
  }, []);

  /** Simple yes/no — returns true if confirmed. */
  const confirm = useCallback((options) => {
    const {
      title,
      message,
      confirmLabel = defaultLabels.confirmLabel,
      cancelLabel = defaultLabels.cancelLabel,
      danger = false,
    } = options;

    return new Promise((resolve) => {
      setDialog({
        title,
        message,
        confirmLabel,
        cancelLabel,
        danger,
        loading: false,
        error: '',
        resolve,
        onConfirm: () => close(true),
        onCancel: () => close(false),
      });
    });
  }, [close]);

  /**
   * Runs async action on confirm; keeps dialog open on error.
   * Resolves true on success, false if cancelled.
   */
  const confirmAction = useCallback((options) => {
    const {
      title,
      message,
      confirmLabel = 'Удалить',
      cancelLabel = defaultLabels.cancelLabel,
      danger = true,
      action,
    } = options;

    return new Promise((resolve) => {
      const run = async () => {
        setDialog((current) => (current ? { ...current, loading: true, error: '' } : current));
        try {
          await action();
          setDialog((current) => {
            current?.resolve?.(true);
            return null;
          });
        } catch (e) {
          setDialog((current) =>
            current
              ? {
                  ...current,
                  loading: false,
                  error: e?.message || 'Ошибка',
                }
              : current
          );
        }
      };

      setDialog({
        title,
        message,
        confirmLabel,
        cancelLabel,
        danger,
        loading: false,
        error: '',
        resolve,
        onConfirm: run,
        onCancel: () => close(false),
      });
    });
  }, [close]);

  /** Informational OK dialog (replaces window.alert). */
  const alert = useCallback((options) => {
    const opts = typeof options === 'string' ? { message: options } : options;
    const {
      title = 'Внимание',
      message = '',
      confirmLabel = 'OK',
    } = opts;

    return new Promise((resolve) => {
      const done = () => close(true);
      setDialog({
        variant: 'alert',
        title,
        message,
        confirmLabel,
        danger: false,
        loading: false,
        error: '',
        resolve,
        onConfirm: done,
        onCancel: done,
      });
    });
  }, [close]);

  const value = useMemo(() => ({ confirm, confirmAction, alert }), [confirm, confirmAction, alert]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {dialog ? (
        <ConfirmDialog
          open
          variant={dialog.variant || 'confirm'}
          title={dialog.title}
          message={dialog.message}
          confirmLabel={dialog.confirmLabel}
          cancelLabel={dialog.cancelLabel}
          danger={dialog.danger}
          loading={dialog.loading}
          error={dialog.error}
          onConfirm={dialog.onConfirm}
          onCancel={dialog.onCancel}
        />
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used within ConfirmProvider');
  }
  return ctx;
}
