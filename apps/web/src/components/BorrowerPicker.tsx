import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { Field } from "@toumua/ui";
import type { BorrowerSummary, CursorListResponse } from "@toumua/contracts";
import { api, errorMessage } from "../api";

type Props = {
  selected: BorrowerSummary | null;
  onPick: (row: BorrowerSummary) => void | Promise<void>;
  onClear?: () => void | Promise<void>;
  /** Shown when the selected borrower has no linked login (submit readiness). */
  borrowerIdForLink?: string | null;
  disabled?: boolean;
};

function linkBadge(linked: boolean) {
  return linked ? (
    <span className="pill">Login linked</span>
  ) : (
    <span className="pill pill-muted">No login linked</span>
  );
}

export function BorrowerPicker({
  selected,
  onPick,
  onClear,
  borrowerIdForLink,
  disabled,
}: Props) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(!selected);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BorrowerSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    if (!selected) {
      setEditing(true);
      return;
    }
    if (!editing) {
      setQuery("");
      setResults([]);
      setOpen(false);
      setActiveIndex(-1);
    }
  }, [selected, editing]);

  useEffect(() => {
    if (!editing || disabled) return;
    const trimmed = query.trim();
    if (trimmed.length < 1) {
      setResults([]);
      setLoading(false);
      setError(null);
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    const controller = new AbortController();
    const handle = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void api<CursorListResponse<BorrowerSummary>>(
        `/borrowers?q=${encodeURIComponent(trimmed)}`,
        { signal: controller.signal },
      )
        .then((data) => {
          if (controller.signal.aborted) return;
          const items = [...data.items].sort(
            (a, b) => Number(Boolean(b.linkedUserId)) - Number(Boolean(a.linkedUserId)),
          );
          setResults(items);
          setOpen(true);
          setActiveIndex(items.length ? 0 : -1);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setResults([]);
          setOpen(false);
          setActiveIndex(-1);
          setError(err);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      controller.abort();
      window.clearTimeout(handle);
    };
  }, [query, editing, disabled]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, []);

  async function choose(row: BorrowerSummary) {
    setOpen(false);
    setQuery("");
    setResults([]);
    setActiveIndex(-1);
    setEditing(false);
    await onPick(row);
  }

  function startChange() {
    setEditing(true);
    setQuery(selected?.name ?? "");
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }

  async function clearSelection() {
    setEditing(true);
    setQuery("");
    setResults([]);
    setOpen(false);
    if (onClear) await onClear();
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
      if (selected) setEditing(false);
      return;
    }
    if (!open || !results.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? results.length - 1 : index - 1));
    } else if (event.key === "Enter" && activeIndex >= 0 && results[activeIndex]) {
      event.preventDefault();
      void choose(results[activeIndex]!);
    }
  }

  const showList = editing && open && (loading || results.length > 0 || Boolean(error));

  return (
    <div ref={rootRef} className="borrower-picker stack">
      {selected && !editing ? (
        <div className="borrower-picker-selected">
          <div className="borrower-picker-selected-main">
            <strong>{selected.name}</strong>
            <span className="hint">
              {selected.number}
              {selected.email ? ` · ${selected.email}` : " · No email on file"}
            </span>
            <div className="borrower-picker-badges">{linkBadge(Boolean(selected.linkedUserId))}</div>
          </div>
          <div className="hero-actions">
            <button type="button" className="btn btn-secondary" onClick={startChange} disabled={disabled}>
              Change
            </button>
            {onClear ? (
              <button type="button" className="btn btn-ghost" onClick={() => void clearSelection()} disabled={disabled}>
                Clear
              </button>
            ) : null}
          </div>
          {!selected.linkedUserId && borrowerIdForLink ? (
            <p className="error" role="alert">
              This borrower has no linked customer login yet.{" "}
              <Link to={`/staff/borrowers/${borrowerIdForLink}/account-link`}>Link account</Link> before you submit.
            </p>
          ) : null}
        </div>
      ) : (
        <Field label="Find borrower" hint="Search by name, borrower number, phone, or email">
          <div className="combobox">
            <input
              ref={inputRef}
              id={`${listId}-input`}
              role="combobox"
              aria-expanded={showList}
              aria-controls={showList ? listId : undefined}
              aria-activedescendant={
                activeIndex >= 0 && results[activeIndex] ? `${listId}-opt-${activeIndex}` : undefined
              }
              aria-autocomplete="list"
              autoComplete="off"
              spellCheck={false}
              disabled={disabled}
              value={query}
              placeholder="Type to search…"
              onFocus={() => {
                if (results.length) setOpen(true);
              }}
              onChange={(event) => {
                setQuery(event.target.value);
                setOpen(true);
              }}
              onKeyDown={onInputKeyDown}
            />
            {showList ? (
              <ul id={listId} className="combobox-list" role="listbox">
                {error ? (
                  <li className="combobox-empty" role="presentation">
                    <span className="error">{errorMessage(error, "Search failed")}</span>
                  </li>
                ) : loading && !results.length ? (
                  <li className="combobox-empty" role="presentation">
                    <span className="hint">Searching…</span>
                  </li>
                ) : results.length ? (
                  results.map((row, index) => (
                    <li key={row.id} role="presentation">
                      <button
                        id={`${listId}-opt-${index}`}
                        type="button"
                        role="option"
                        aria-selected={index === activeIndex}
                        className={`combobox-option${index === activeIndex ? " combobox-option-active" : ""}`}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => void choose(row)}
                      >
                        <span className="combobox-option-title">{row.name}</span>
                        <span className="combobox-option-meta">
                          {row.number}
                          {row.email ? ` · ${row.email}` : " · No email on file"}
                        </span>
                        <span className="combobox-option-badge">{linkBadge(Boolean(row.linkedUserId))}</span>
                      </button>
                    </li>
                  ))
                ) : (
                  <li className="combobox-empty" role="presentation">
                    <span className="hint">No borrowers match this search.</span>
                  </li>
                )}
              </ul>
            ) : null}
          </div>
        </Field>
      )}
      {selected && editing ? (
        <p className="hint">
          Pick a new borrower below, or{" "}
          <button type="button" className="linkish" onClick={() => setEditing(false)}>
            keep {selected.name}
          </button>
          .
        </p>
      ) : null}
    </div>
  );
}
