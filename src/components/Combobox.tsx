import { Fragment, useEffect, useId, useMemo, useState } from 'react';

export type Option = { value: string; label: string; hint?: string; terms?: string[]; group?: string };

type Props = {
  options: Option[];
  preferredValue?: string;
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
export default function Combobox({ options, preferredValue, value, text: controlled, onSelect, placeholder, allowCustom, id, required, ...aria }: Props) {
  const listId = useId();
  const selected = options.find((o) => o.value === value);
  const [text, setText] = useState(controlled ?? selected?.label ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // Parent can set the value from elsewhere (e.g. a map tap); reflect it in the input.
  useEffect(() => { setText(controlled ?? selected?.label ?? ''); }, [selected, controlled]);

  const q = norm(text);
  const results = useMemo(() => {
    const empty = !q || selected?.label === text;
    const starts: Option[] = [], has: Option[] = [];
    for (const o of options) {
      const hay = [o.label, ...(o.terms ?? [])].map(norm);
      if (empty || hay.some((h) => h.startsWith(q))) starts.push(o);
      else if (hay.some((h) => h.includes(q))) has.push(o);
    }
    const matches = [...starts, ...has];
    const preferred = empty ? matches.find((o) => o.value === preferredValue) : undefined;
    const groups = [...new Set(options.map((o) => o.group))];
    const ordered = groups.flatMap((group) => matches.filter((o) => o.group === group && o !== preferred).slice(0, groups.length > 1 ? 20 : 40));
    return preferred ? [{ ...preferred, group: preferred.group ? 'Detected' : undefined }, ...ordered] : ordered;
  }, [q, options, preferredValue, selected, text]);

  const addLabel = q && !results.length && allowCustom ? allowCustom(text.trim()) : null;
  const rows = addLabel ? [...results, null] : results;

  useEffect(() => { if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' }); }, [active, listId, open]);

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
      setActive((a) => !open ? e.key === 'ArrowDown' ? 0 : rows.length - 1 : (a + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % Math.max(rows.length, 1));
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
        onFocus={(e) => { e.target.select(); setActive(0); setOpen(true); }}
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
            <Fragment key={o?.value ?? '__add'}>
            {o?.group && o.group !== rows[i - 1]?.group && <li className="combo-heading" role="presentation">{o.group}</li>}
            <li id={`${listId}-${i}`} role="option" aria-selected={i === active}
              className={o ? undefined : 'add'} onMouseEnter={() => setActive(i)} onClick={() => choose(o)}>
              {o ? <>{o.label}{o.hint && <small>{o.hint}</small>}</> : <>+ {addLabel}</>}
            </li>
            </Fragment>
          ))}
        </ul>
      )}
    </div>
  );
}
