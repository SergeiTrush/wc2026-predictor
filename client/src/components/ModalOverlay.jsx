import { createPortal } from 'react-dom';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';

function getModalRoot() {
  return document.getElementById('modal-root') || document.body;
}

/**
 * Full-screen overlay rendered at the top of the document (via #modal-root portal).
 */
export default function ModalOverlay({ className = '', onClick, lockScroll = false, children }) {
  useLockBodyScroll(lockScroll);

  const classes = className ? `modal-overlay ${className}` : 'modal-overlay';

  return createPortal(
    <div className={classes} onClick={onClick}>
      {children}
    </div>,
    getModalRoot()
  );
}
