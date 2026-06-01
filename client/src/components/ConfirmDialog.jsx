import ModalOverlay from './ModalOverlay';

/**
 * Styled confirmation modal (replaces window.confirm).
 */
export default function ConfirmDialog({
  open,
  variant = 'confirm',
  title,
  message,
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  danger = false,
  loading = false,
  error = '',
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  const busy = loading;
  const isAlert = variant === 'alert';
  const dismiss = () => {
    if (!busy) onCancel?.();
  };

  return (
    <ModalOverlay onClick={dismiss}>
      <div className="modal-sheet confirm-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
        <h3 id="confirm-dialog-title" className="confirm-sheet-title">
          {title}
        </h3>
        {message ? <p className="confirm-sheet-text">{message}</p> : null}
        {error ? <p className="error-banner confirm-sheet-error">{error}</p> : null}
        <div className={`confirm-sheet-actions ${isAlert ? 'confirm-sheet-actions--single' : ''}`}>
          {!isAlert && (
            <button
              type="button"
              className="btn-primary btn-confirm-cancel"
              disabled={busy}
              onClick={onCancel}
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            className={`btn-primary ${!isAlert && danger ? 'btn-confirm-danger' : ''}`}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? 'Подождите…' : confirmLabel}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
