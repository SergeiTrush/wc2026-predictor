import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

function buildOptions(homeTeam, awayTeam) {
  return [
    { value: '', label: '—' },
    { value: 'home', label: homeTeam },
    { value: 'away', label: awayTeam },
    { value: 'none', label: 'Никто / 0:0' },
  ];
}

export default function FirstTeamSelect({
  value,
  onChange,
  homeTeam,
  awayTeam,
  disabled = false,
  onBlur,
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);
  const listId = useId();

  const options = buildOptions(homeTeam, awayTeam);
  const selected = options.find((o) => o.value === value) ?? options[0];

  const close = useCallback(
    (fireBlur = true) => {
      setOpen(false);
      if (fireBlur) onBlur?.();
    },
    [onBlur]
  );

  const updateMenuPosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      zIndex: 1200,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const onDocPointer = (e) => {
      if (rootRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      close(true);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close(true);
    };
    document.addEventListener('mousedown', onDocPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  const pick = (next) => {
    if (disabled) return;
    onChange(next);
    close(true);
  };

  const toggle = () => {
    if (disabled) return;
    if (open) {
      close(true);
      return;
    }
    updateMenuPosition();
    setOpen(true);
  };

  const menu =
    open &&
    menuStyle &&
    createPortal(
      <ul
        ref={menuRef}
        id={listId}
        className="custom-select-menu"
        role="listbox"
        style={menuStyle}
        aria-label="Команда, открывшая счёт"
      >
        {options.map((opt) => (
          <li key={opt.value || '_empty'} role="presentation">
            <button
              type="button"
              role="option"
              aria-selected={value === opt.value}
              className={`custom-select-option ${value === opt.value ? 'custom-select-option--selected' : ''}`}
              onClick={() => pick(opt.value)}
            >
              {opt.label}
            </button>
          </li>
        ))}
      </ul>,
      document.body
    );

  return (
    <>
      <div
        ref={rootRef}
        className={`custom-select ${open ? 'custom-select--open' : ''} ${disabled ? 'custom-select--disabled' : ''} ${className}`.trim()}
      >
        <button
          ref={triggerRef}
          type="button"
          className="custom-select-trigger"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          onClick={toggle}
        >
          <span className="custom-select-value">{selected.label}</span>
          <span className="custom-select-chevron" aria-hidden="true">
            ▾
          </span>
        </button>
      </div>
      {menu}
    </>
  );
}
