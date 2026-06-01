import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import ModalOverlay from './ModalOverlay';

function getModalRoot() {
  return document.getElementById('modal-root') || document.body;
}

export default function CenteredSelectMenu({
  open,
  onClose,
  title,
  ariaLabel,
  listId,
  children,
  className = '',
  overlayClassName = '',
  showCloseButton = false,
  toolbar = null,
}) {
  const sheetRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <ModalOverlay
      className={`modal-overlay--center centered-select-overlay ${overlayClassName}`.trim()}
      onClick={onClose}
      lockScroll
    >
      <div
        ref={sheetRef}
        className={`centered-select-sheet ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={title || ariaLabel}
        onClick={(e) => e.stopPropagation()}
      >
        {title ? (
          <div className="centered-select-header">
            <div className="centered-select-title">{title}</div>
            {showCloseButton ? (
              <button
                type="button"
                className="modal-close centered-select-close"
                onClick={onClose}
                aria-label="Закрыть"
              >
                ×
              </button>
            ) : null}
          </div>
        ) : null}
        {toolbar}
        <ul id={listId} className="custom-select-menu centered-select-menu" role="listbox" aria-label={ariaLabel}>
          {children}
        </ul>
      </div>
    </ModalOverlay>,
    getModalRoot()
  );
}
