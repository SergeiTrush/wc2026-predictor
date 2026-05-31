import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import CenteredSelectMenu from './CenteredSelectMenu';
import PlusIconButton from './PlusIconButton';

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
    const searchHaystack = [value, p.surname, p.name, p.team, p.number != null ? String(p.number) : '']
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return [
      {
        value,
        label: formatPlayerLabel(p, { grouped }),
        legacySurname: p.surname || '',
        searchHaystack,
        key: `${dedupeKey}:${value}:${p.number ?? ''}`,
      },
    ];
  });
}

function filterOptionsByQuery(options, query) {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  return options.filter((opt) => opt.searchHaystack?.includes(q) || opt.label.toLowerCase().includes(q));
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
  triggerVariant = 'default',
}) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [menuStyle, setMenuStyle] = useState(null);
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);
  const searchInputRef = useRef(null);
  const listId = useId();
  const useIconTrigger = triggerVariant === 'icon';

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
      setSearchQuery('');
      if (fireBlur) onBlur?.();
    },
    [onBlur]
  );

  useEffect(() => {
    if (!open || !useIconTrigger) return;
    const id = requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open, useIconTrigger]);

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
    if (!open || useIconTrigger) return;
    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [open, updateMenuPosition, useIconTrigger]);

  useEffect(() => {
    if (!open || useIconTrigger) return;
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
  }, [open, close, useIconTrigger]);

  const pick = (next) => {
    if (disabled) return;
    onChange(next);
    close(false);
  };

  const openMenu = () => {
    if (disabled) return;
    onOpen?.();
    if (!useIconTrigger) updateMenuPosition();
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

  const renderOptionButton = (opt) => (
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
  );

  const renderOptions = (sections = groupedSections, options = flatOptions) => {
    if (sections.length && !searchQuery.trim()) {
      return sections.map((section) => (
        <li key={section.team} className="custom-select-group" role="presentation">
          <div className="custom-select-group-label">{section.team}</div>
          <ul className="custom-select-group-list">
            {section.options.map((opt) => renderOptionButton(opt))}
          </ul>
        </li>
      ));
    }

    return options.map((opt) => renderOptionButton(opt));
  };

  const filteredOptions = useMemo(
    () => filterOptionsByQuery(flatOptions, searchQuery),
    [flatOptions, searchQuery]
  );

  const searching = searchQuery.trim().length > 0;

  const menuBody = (
    <>
      {!searching && (
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
      )}
      {loading && (
        <li className="custom-select-status" role="presentation">
          Загрузка…
        </li>
      )}
      {!loading && searching && filteredOptions.length === 0 && (
        <li className="custom-select-status custom-select-status--empty" role="presentation">
          Ничего не найдено
        </li>
      )}
      {!loading && (searching ? renderOptions([], filteredOptions) : renderOptions())}
      {!loading && !searching && flatOptions.length === 0 && (
        <li className="custom-select-status custom-select-status--empty" role="presentation">
          {placeholder}
        </li>
      )}
    </>
  );

  const dropdownMenu =
    !useIconTrigger &&
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
        {menuBody}
      </ul>,
      document.body
    );

  const centeredMenu = useIconTrigger && (
    <CenteredSelectMenu
      open={open}
      onClose={() => close(true)}
      title="Какой игрок откроет счёт"
      ariaLabel="Игрок, открывший счёт"
      listId={listId}
      className="centered-select-sheet--players"
      toolbar={
        <div className="centered-select-search">
          <input
            ref={searchInputRef}
            type="search"
            className="centered-select-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по имени"
            aria-label="Поиск игрока по имени"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      }
    >
      {menuBody}
    </CenteredSelectMenu>
  );

  if (useIconTrigger) {
    return (
      <>
        <PlusIconButton
          onClick={toggle}
          disabled={disabled}
          active={!!value}
          ariaLabel={
            value
              ? `Игрок, открывший счёт: ${triggerLabel}. Изменить`
              : 'Выбрать игрока, который откроет счёт'
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
      {dropdownMenu}
    </>
  );
}
