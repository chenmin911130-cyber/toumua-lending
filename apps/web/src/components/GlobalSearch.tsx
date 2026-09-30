import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { api, errorMessage } from "../api";

type Hit = { id: string; label: string; meta: string; href: string };
type SearchResponse = {
  borrowers: Hit[];
  applications: Hit[];
  loans: Hit[];
  assets: Hit[];
  transactions: Hit[];
};

const GROUPS: Array<{ key: keyof SearchResponse; label: string }> = [
  { key: "borrowers", label: "Borrowers" },
  { key: "applications", label: "Applications" },
  { key: "loans", label: "Loans" },
  { key: "assets", label: "Assets" },
  { key: "transactions", label: "Transactions" },
];

export function GlobalSearch() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [data, setData] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<unknown>(null);

  function close() {
    setOpen(false);
    setData(null);
    setError(null);
  }

  function openSearch() {
    setQ("");
    setData(null);
    setError(null);
    setOpen(true);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openSearch();
      }
      if (event.key === "Escape" && open) {
        event.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handle = window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(handle);
  }, [open]);

  useEffect(() => {
    if (!open || q.trim().length < 2) {
      setData(null);
      setError(null);
      return;
    }
    const controller = new AbortController();
    const handle = window.setTimeout(() => {
      setError(null);
      void api<SearchResponse>(`/search?q=${encodeURIComponent(q.trim())}`, { signal: controller.signal })
        .then((next) => {
          if (!controller.signal.aborted) setData(next);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setData(null);
          setError(err);
        });
    }, 200);
    return () => {
      controller.abort();
      window.clearTimeout(handle);
    };
  }, [open, q]);

  const overlay = open ? (
    <div className="search-overlay" role="dialog" aria-label="Search">
      <button type="button" className="search-backdrop" aria-label="Close search" onClick={close} />
      <div className="search-panel">
        <input
          ref={inputRef}
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search borrowers, loans, receipts…"
          aria-label="Search"
          autoComplete="off"
          spellCheck={false}
        />
        <p className="hint">Type at least 2 characters. Esc closes.</p>
        {error ? <p className="error" role="alert">{errorMessage(error, "Search failed")}</p> : null}
        {data ? (
          GROUPS.map((group) =>
            data[group.key].length ? (
              <section key={group.key}>
                <h3>{group.label}</h3>
                {data[group.key].map((hit) => (
                  <button
                    key={hit.id}
                    type="button"
                    className="search-hit"
                    onClick={() => {
                      close();
                      setQ("");
                      navigate(hit.href);
                    }}
                  >
                    <strong>{hit.label}</strong>
                    <span>{hit.meta}</span>
                  </button>
                ))}
              </section>
            ) : null,
          )
        ) : !error && q.trim().length >= 2 ? (
          <p className="hint">Searching…</p>
        ) : null}
        {data && GROUPS.every((group) => data[group.key].length === 0) ? (
          <p className="hint">No matching records.</p>
        ) : null}
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        className="staff-nav-button"
        data-control-id="GLOBAL-08"
        onClick={openSearch}
        aria-expanded={open}
      >
        Search
      </button>
      {overlay ? createPortal(overlay, document.body) : null}
    </>
  );
}
