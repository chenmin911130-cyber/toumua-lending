import { FormEvent, Fragment, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { StorageLocationDetail, StorageLocationKind, StorageLocationView } from "@toumua/contracts";
import { Button, Field } from "@toumua/ui";
import { api, errorMessage } from "../api";
import { useAuth } from "../auth";

const KINDS: StorageLocationKind[] = ["SAFE", "LOCKED_CABINET", "SHELF", "SECURE_YARD", "OFFSITE"];

const KIND_LABEL: Record<StorageLocationKind, string> = {
  SAFE: "Safe",
  LOCKED_CABINET: "Locked cabinet",
  SHELF: "Shelf",
  SECURE_YARD: "Secure yard",
  OFFSITE: "Off-site",
};

export function formatLocationOption(location: Pick<StorageLocationView, "code" | "name" | "occupied" | "capacity">) {
  const usage = location.capacity != null ? `${location.occupied}/${location.capacity}` : String(location.occupied);
  return `${location.code} · ${location.name} (${usage})`;
}

export function locationIsFull(location: Pick<StorageLocationView, "occupied" | "capacity">) {
  return location.capacity != null && location.occupied >= location.capacity;
}

export function StorageLocationField({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [locations, setLocations] = useState<StorageLocationView[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void api<{ items: StorageLocationView[] }>("/storage-locations?active=true")
      .then((data) => {
        setLocations(data.items);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  const emptyHint =
    !loading && !error && locations.length === 0
      ? "No active storage locations yet. A manager or valuation officer can add them under Staff → Storage."
      : undefined;

  return (
    <Field
      label="Storage location"
      error={error ? errorMessage(error, "Could not load locations") : undefined}
      hint={emptyHint}
    >
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
        disabled={loading || Boolean(error) || locations.length === 0}
      >
        <option value="">{loading ? "Loading locations…" : "Select a location"}</option>
        {locations.map((location) => (
          <option key={location.id} value={location.id} disabled={locationIsFull(location)}>
            {formatLocationOption(location)}
          </option>
        ))}
      </select>
    </Field>
  );
}

type Draft = {
  code: string;
  name: string;
  kind: StorageLocationKind;
  capacity: string;
  secure: boolean;
  notes: string;
  active: boolean;
};

const EMPTY_DRAFT: Draft = {
  code: "",
  name: "",
  kind: "SAFE",
  capacity: "",
  secure: true,
  notes: "",
  active: true,
};

function draftFrom(location: StorageLocationView): Draft {
  return {
    code: location.code,
    name: location.name,
    kind: location.kind,
    capacity: location.capacity == null ? "" : String(location.capacity),
    secure: location.secure,
    notes: location.notes ?? "",
    active: location.active,
  };
}

function capacityValue(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (!/^[1-9]\d*$/.test(trimmed)) return undefined;
  return Number(trimmed);
}

export function StaffStoragePage() {
  const { user } = useAuth();
  const canManage = user?.role === "MANAGER" || user?.role === "VALUATION_OFFICER";
  const [items, setItems] = useState<StorageLocationView[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<StorageLocationDetail | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function reload() {
    const data = await api<{ items: StorageLocationView[] }>("/storage-locations");
    setItems(data.items);
  }

  useEffect(() => {
    void reload().catch(setError);
  }, []);

  useEffect(() => {
    if (!openId) {
      setDetail(null);
      return;
    }
    void api<StorageLocationDetail>(`/storage-locations/${openId}`).then(setDetail).catch(setError);
  }, [openId]);

  function beginCreate() {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setShowForm(true);
    setError(null);
  }

  function beginEdit(location: StorageLocationView) {
    setEditingId(location.id);
    setDraft(draftFrom(location));
    setShowForm(true);
    setError(null);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const capacity = capacityValue(draft.capacity);
    if (capacity === undefined) {
      setError(new Error("Capacity must be a positive whole number, or left blank"));
      return;
    }
    setError(null);
    const body = {
      code: draft.code.trim().toUpperCase(),
      name: draft.name.trim(),
      kind: draft.kind,
      secure: draft.secure,
      capacity,
      notes: draft.notes.trim() || null,
      active: draft.active,
    };
    try {
      if (editingId) {
        await api(`/storage-locations/${editingId}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await api("/storage-locations", { method: "POST", body: JSON.stringify(body) });
      }
      setShowForm(false);
      await reload();
      if (openId) {
        setDetail(await api<StorageLocationDetail>(`/storage-locations/${openId}`));
      }
    } catch (err) {
      setError(err);
    }
  }

  async function setActive(location: StorageLocationView, active: boolean) {
    setError(null);
    try {
      await api(`/storage-locations/${location.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active }),
      });
      await reload();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <main className="staff-page">
      <div className="hero-actions">
        <h1>Storage locations</h1>
        {canManage ? (
          <Button type="button" onClick={beginCreate}>Add location</Button>
        ) : null}
      </div>
      {error ? <p className="error">{errorMessage(error, "Could not update storage locations")}</p> : null}
      {showForm && canManage ? (
        <form className="card stack" onSubmit={(event) => void save(event)}>
          <h2>{editingId ? "Edit location" : "New location"}</h2>
          <Field label="Code">
            <input
              value={draft.code}
              onChange={(event) => setDraft({ ...draft, code: event.target.value.toUpperCase() })}
              required
              maxLength={20}
            />
          </Field>
          <Field label="Name">
            <input
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              required
              maxLength={100}
            />
          </Field>
          <Field label="Type">
            <select
              value={draft.kind}
              onChange={(event) => setDraft({ ...draft, kind: event.target.value as StorageLocationKind })}
            >
              {KINDS.map((kind) => (
                <option key={kind} value={kind}>{KIND_LABEL[kind]}</option>
              ))}
            </select>
          </Field>
          <Field label="Capacity" hint="Leave blank if the place has no fixed limit.">
            <input
              value={draft.capacity}
              onChange={(event) => setDraft({ ...draft, capacity: event.target.value })}
              inputMode="numeric"
            />
          </Field>
          <label className="hint">
            <input
              type="checkbox"
              checked={draft.secure}
              onChange={(event) => setDraft({ ...draft, secure: event.target.checked })}
            />{" "}
            Secure storage
          </label>
          <Field label="Notes">
            <input
              value={draft.notes}
              onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
            />
          </Field>
          <div className="hero-actions">
            <Button type="submit">{editingId ? "Save changes" : "Create location"}</Button>
            <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </form>
      ) : null}
      <table className="data-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Name</th>
            <th>Type</th>
            <th>In store</th>
            <th>Secure</th>
            <th>Status</th>
            {canManage ? <th></th> : null}
          </tr>
        </thead>
        <tbody>
          {items.length ? items.map((location) => (
            <Fragment key={location.id}>
              <tr
                onClick={() => setOpenId(openId === location.id ? null : location.id)}
                style={{ cursor: "pointer" }}
              >
                <td>{location.code}</td>
                <td>{location.name}</td>
                <td>{KIND_LABEL[location.kind]}</td>
                <td>{location.capacity != null ? `${location.occupied}/${location.capacity}` : location.occupied}</td>
                <td>{location.secure ? "Yes" : "No"}</td>
                <td>{location.active ? "Active" : "Inactive"}</td>
                {canManage ? (
                  <td>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={(event) => {
                        event.stopPropagation();
                        beginEdit(location);
                      }}
                    >
                      Edit
                    </button>{" "}
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={(event) => {
                        event.stopPropagation();
                        void setActive(location, !location.active);
                      }}
                    >
                      {location.active ? "Deactivate" : "Reactivate"}
                    </button>
                  </td>
                ) : null}
              </tr>
              {openId === location.id ? (
                <tr key={`${location.id}-assets`}>
                  <td colSpan={canManage ? 7 : 6}>
                    {detail && detail.id === location.id ? (
                      detail.assets.length ? (
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Asset</th>
                              <th>Borrower</th>
                              <th>Loan</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.assets.map((asset) => (
                              <tr key={asset.id}>
                                <td><Link to={`/staff/collateral/${asset.id}`}>{asset.name}</Link></td>
                                <td>
                                  {asset.borrowerName
                                    ? `${asset.borrowerName}${asset.borrowerNumber ? ` (${asset.borrowerNumber})` : ""}`
                                    : "—"}
                                </td>
                                <td>{asset.loanNumber ?? "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <p className="hint">No assets are stored here.</p>
                      )
                    ) : (
                      <p className="hint">Loading assets…</p>
                    )}
                  </td>
                </tr>
              ) : null}
            </Fragment>
          )) : (
            <tr><td colSpan={canManage ? 7 : 6} className="empty-row">No storage locations yet.</td></tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
