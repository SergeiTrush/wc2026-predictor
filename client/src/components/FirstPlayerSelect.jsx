import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

function playerValue(player) {
  return (player.name || player.surname || '').trim();
}

function formatPlayerLabel(player, { grouped = false } = {}) {
  const name = playerValue(player);
  let label = name;
  if (player.number != null) label += ` #${player.number}`;
  if (!grouped && player.team) label += ` (${player.team})`;
  return label;
}

function buildOptionsFromPlayers(players, { grouped = false } = {}) {
  const seen = new Set();
  return players.flatMap((p) => {
    const value = playerValue(p);
    if (!value) return [];
    const dedupeKey = p.id != null ? `${p.team}:${p.id}` : `${p.team}:${value.toLowerCase()}`;
    if (seen.has(dedupeKey)) return [];
    seen.add(dedupeKey);
    return [
      {
        value,
        label: formatPlayerLabel(p, { grouped }),
        legacySurname: p.surname || '',
        key: `${dedupeKey}:${value}:${p.number ?? ''}`,
      },
    ];
  });
}

function buildGroupedSections(teams) {
  return (teams || [])
    .filter((entry) => entry?.team && Array.isArray(entry.players) && entry.players.length)
    .map((entry) => ({
      team: entry.team,
      options: buildOptionsFromPlayers(entry.players, { grouped: true }),
    }))
    .filter((section) => section.options.length);
}

export default function FirstPlayerSelect({
  value,
  onChange,
  teams = null,
  players = [],
  loading = false,
  placeholder = 'Игрок',
  emptyLabel = '—',
  disabled = false,
  onBlur,
  onOpen,
  title,
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);
  const listId = useId();

  const groupedSections = useMemo(() => buildGroupedSections(teams), [teams]);
  const flatOptions = useMemo(
    () => (groupedSections.length ? groupedSections.flatMap((s) => s.options) : buildOptionsFromPlayers(players)),
    [groupedSections, players]
  );

  const selected =
    flatOptions.find((o) => o.value === value) ||
    flatOptions.find((o) => o.legacySurname && o.legacySurname === value);
  const triggerLabel = selected?.label || value || placeholder;

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
      width: Math.max(rect.width, 220),
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

  const openMenu = () => {
    if (disabled) return;
    onOpen?.();
    updateMenuPosition();
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

  const renderOptions = () => {
    if (groupedSections.length) {
      return groupedSections.map((section) => (
        <li key={section.team} className="custom-select-group" role="presentation">
          <div className="custom-select-group-label">{section.team}</div>
          <ul className="custom-select-group-list">
            {section.options.map((opt) => (
              <li key={opt.key} role="presentation">
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
          </ul>
        </li>
      ));
    }

    return flatOptions.map((opt) => (
      <li key={opt.key} role="presentation">
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
    ));
  };

  const menu =
    open &&
    menuStyle &&
    createPortal(
      <ul
        ref={menuRef}
        id={listId}
        className="custom-select-menu custom-select-menu--players"
        role="listbox"
        style={menuStyle}
        aria-label="Игрок, открывший счёт"
      >
        <li role="presentation">
          <button
            type="button"
            role="option"
            aria-selected={!value}
            className={`custom-select-option ${!value ? 'custom-select-option--selected' : ''}`}
            onClick={() => pick('')}
          >
            {emptyLabel}
          </button>
        </li>
        {loading && (
          <li className="custom-select-status" role="presentation">
            Загрузка…
          </li>
        )}
        {!loading && renderOptions()}
        {!loading && flatOptions.length === 0 && (
          <li className="custom-select-status custom-select-status--empty" role="presentation">
            {placeholder}
          </li>
        )}
      </ul>,
      document.body
    );

  return (
    <>
      <div
        ref={rootRef}
        className={`custom-select ${open ? 'custom-select--open' : ''} ${disabled ? 'custom-select--disabled' : ''} ${!value ? 'custom-select--placeholder' : ''} ${className}`.trim()}
      >
        <button
          ref={triggerRef}
          type="button"
          className="custom-select-trigger"
          disabled={disabled}
          title={title}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          onClick={toggle}
        >
          <span className="custom-select-value">{triggerLabel}</span>
          <span className="custom-select-chevron" aria-hidden="true">
            ▾
          </span>
        </button>
      </div>
      {menu}
    </>
  );
}
