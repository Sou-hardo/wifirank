import { useEffect, useId, useMemo, useState } from 'react';

export type Option = { value: string; label: string; hint?: string; terms?: string[] };

type Props = {
  options: Option[];
  value: string; // selected option value, or '' (custom text lives in `text`)
  text?: string;
  onSelect: (o: Option | null, text: string) => void; // null option = free text (custom)
  placeholder?: string;
  allowCustom?: (text: string) => string | null; // returns the "add" row label, or null to disallow
  id?: string;
  required?: boolean;
  'aria-labelledby'?: string;
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// ARIA 1.2 combobox: input + listbox, keyboard and pointer. Popular-first order when empty.
export default function Combobox({ options, value, text: controlled, onSelect, placeholder, allowCustom, id, required, ...aria }: Props) {
  const listId = useId();
  const selected = options.find((o) => o.value === value);
  const [text, setText] = useState(controlled ?? selected?.label ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // Parent can set the value from elsewhere (e.g. a map tap); reflect it in the input.
  useEffect(() => { setText(controlled ?? selected?.label ?? ''); }, [selected, controlled]);

  const q = norm(text);
  const results = useMemo(() => {
    if (!q || selected?.label === text) return options.slice(0, 40);
    const starts: Option[] = [], has: Option[] = [];
    for (const o of options) {
      const hay = [o.label, ...(o.terms ?? [])].map(norm);
      if (hay.some((h) => h.startsWith(q))) starts.push(o);
      else if (hay.some((h) => h.includes(q))) has.push(o);
    }
    return [...starts, ...has].slice(0, 40);
  }, [q, options, selected, text]);

  const exact = options.some((o) => norm(o.label) === q || o.terms?.some((t) => norm(t) === q));
  const addLabel = q && !exact && allowCustom ? allowCustom(text.trim()) : null;
  const rows = addLabel ? [...results, null] : results;

  const choose = (o: Option | null) => {
    const t = o ? o.label : text.trim();
    setText(t);
    setOpen(false);
    onSelect(o, t);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % Math.max(rows.length, 1));
    } else if (e.key === 'Enter' && open && rows.length) {
      e.preventDefault();
      choose(rows[active] ?? null);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="combo">
      <input
        id={id}
        className="input"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && rows.length && active < rows.length ? `${listId}-${active}` : undefined}
        aria-labelledby={aria['aria-labelledby']}
        autoComplete="off"
        spellCheck={false}
        required={required}
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setActive(0);
          setOpen(true);
          onSelect(null, e.target.value); // typing clears the selection until a row is chosen
        }}
        onFocus={(e) => { e.target.select(); setOpen(true); }}
        onBlur={() => {
          setOpen(false);
          // Leaving with an exact (case-insensitive) match counts as choosing it.
          const hit = options.find((o) => norm(o.label) === q || o.terms?.some((t) => norm(t) === q));
          if (hit && hit.value !== value) choose(hit);
        }}
        onKeyDown={onKey}
      />
      {open && rows.length === 0 && <p className="small muted" role="status">No matches. Try another name.</p>}
      {open && rows.length > 0 && (
        <ul className="combo-list" role="listbox" id={listId} onMouseDown={(e) => e.preventDefault()}>
          {rows.map((o, i) => (
            <li key={o?.value ?? '__add'} id={`${listId}-${i}`} role="option" aria-selected={i === active}
              className={o ? undefined : 'add'} onMouseEnter={() => setActive(i)} onClick={() => choose(o)}>
              {o ? <>{o.label}{o.hint && <small>{o.hint}</small>}</> : <>+ {addLabel}</>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
