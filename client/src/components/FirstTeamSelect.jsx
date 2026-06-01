import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { teamFlag } from '../utils';
import { computeFixedDropdownStyle } from '../dropdownPosition';
import CenteredSelectMenu from './CenteredSelectMenu';
import PlusIconButton from './PlusIconButton';

function buildOptions(homeTeam, awayTeam) {
  return [
    { value: '', label: '—', flag: null },
    { value: 'home', label: homeTeam, flag: teamFlag(homeTeam) },
    { value: 'away', label: awayTeam, flag: teamFlag(awayTeam) },
    { value: 'none', label: 'Никто / 0:0', flag: null },
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
  triggerVariant = 'default',
  pickerTitle = 'Какая команда откроет счёт',
}) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);
  const listId = useId();
  const useIconTrigger = triggerVariant === 'icon';
  const useModalTrigger = triggerVariant === 'modal';
  const useCenteredMenu = useIconTrigger || useModalTrigger;

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
    const placement = computeFixedDropdownStyle(rect, {
      searchHeight: 0,
      minMenuHeight: 80,
      preferredMenuHeight: 160,
      minWidth: rect.width,
    });
    setMenuStyle({
      position: placement.position,
      top: placement.top,
      bottom: placement.bottom,
      left: placement.left,
      width: placement.width,
      zIndex: placement.zIndex,
      maxHeight: placement.maxHeight,
      ...placement.style,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open || useCenteredMenu) return;
    updateMenuPosition();
    const id = requestAnimationFrame(updateMenuPosition);
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [open, updateMenuPosition, useCenteredMenu]);

  useEffect(() => {
    if (!open || useCenteredMenu) return;
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
  }, [open, close, useCenteredMenu]);

  const pick = (next) => {
    if (disabled) return;
    onChange(next);
    close(false);
  };

  const openMenu = () => {
    if (disabled) return;
    if (!useCenteredMenu) updateMenuPosition();
    setOpen(true);
  };

  const toggle = () => {
    if (disabled) return;
    if (open) {
      close(true);
      return;
    }
    openMenu();
  };

  const optionButtons = options.map((opt) => (
    <li key={opt.value || '_empty'} role="presentation">
      <button
        type="button"
        role="option"
        aria-selected={value === opt.value}
        className={`custom-select-option ${value === opt.value ? 'custom-select-option--selected' : ''}`}
        onClick={() => pick(opt.value)}
      >
        {opt.flag ? (
          <span className="custom-select-option-flag" aria-hidden="true">
            {opt.flag}
          </span>
        ) : null}
        <span className="custom-select-option-label">{opt.label}</span>
      </button>
    </li>
  ));

  const triggerButton = (
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
      <span className="custom-select-value">
        {selected.flag ? (
          <span className="custom-select-option-flag" aria-hidden="true">
            {selected.flag}
          </span>
        ) : null}
        <span className="custom-select-option-label">{selected.label}</span>
      </span>
      <span className="custom-select-chevron" aria-hidden="true">
        ▾
      </span>
    </button>
  );

  const dropdownMenu =
    !useCenteredMenu &&
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
        {optionButtons}
      </ul>,
      document.body
    );

  const centeredMenu = useCenteredMenu && (
    <CenteredSelectMenu
      open={open}
      onClose={() => close(true)}
      title={pickerTitle}
      ariaLabel="Команда, открывшая счёт"
      listId={listId}
    >
      {optionButtons}
    </CenteredSelectMenu>
  );

  if (useModalTrigger) {
    return (
      <>
        <div
          ref={rootRef}
          className={`custom-select ${open ? 'custom-select--open' : ''} ${disabled ? 'custom-select--disabled' : ''} ${!value ? 'custom-select--placeholder' : ''} ${className}`.trim()}
        >
          {triggerButton}
        </div>
        {centeredMenu}
      </>
    );
  }

  if (useIconTrigger) {
    return (
      <>
        <PlusIconButton
          onClick={toggle}
          disabled={disabled}
          active={!!value}
          ariaLabel={
            value
              ? `Команда, открывшая счёт: ${selected.label}. Изменить`
              : 'Выбрать команду, которая откроет счёт'
          }
        />
        {centeredMenu}
      </>
    );
  }

  return (
    <>
      <div
        ref={rootRef}
        className={`custom-select ${open ? 'custom-select--open' : ''} ${disabled ? 'custom-select--disabled' : ''} ${className}`.trim()}
      >
        {triggerButton}
      </div>
      {dropdownMenu}
    </>
  );
}
