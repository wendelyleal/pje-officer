import { useEffect, useMemo, useState } from "react";
import { parseAsBoolean, parseAsInteger, parseAsString, useQueryState } from "nuqs";
import { RefreshCw, Plus, Trash2 } from "lucide-react";
import { Button } from "./components/ui/button";
import { Card } from "./components/ui/card";
import { Input } from "./components/ui/input";

type Certificate = {
  id: number;
  name: string;
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  isCurrentlyValid: boolean;
};

type FormState = {
  name: string;
  password: string;
  pfxBase64: string;
};

const initialForm: FormState = { name: "", password: "", pfxBase64: "" };

async function fetchCertificates(): Promise<Certificate[]> {
  const response = await fetch("/api/certificates/");
  if (!response.ok) throw new Error("Failed to load certificates");
  return response.json();
}

async function toBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function Modal({ open, children }: { open: boolean; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-xl rounded-lg border border-slate-700 bg-slate-900 p-6 shadow-2xl">{children}</div>
    </div>
  );
}

export default function App() {
  const [search, setSearch] = useQueryState("search", parseAsString.withDefault(""));
  const [addOpen, setAddOpen] = useQueryState("add", parseAsBoolean.withDefault(false));
  const [selectedId, setSelectedId] = useQueryState("selected", parseAsInteger);
  const [editId, setEditId] = useQueryState("edit", parseAsInteger);

  const [items, setItems] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((item) =>
      [item.name, item.subject, item.issuer].some((value) => value.toLowerCase().includes(normalized))
    );
  }, [items, search]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setItems(await fetchCertificates());
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const data = await fetchCertificates();
        if (!active) return;
        setItems(data);
      } catch (err) {
        if (!active) return;
        setError(String(err));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function saveCertificate() {
    setSaving(true);
    setError(null);

    try {
      const method = editId ? "PUT" : "POST";
      const endpoint = editId ? `/api/certificates/${editId}/` : "/api/certificates/";
      const response = await fetch(endpoint, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || "Failed to save certificate");
      }

      setForm(initialForm);
      await setAddOpen(false);
      await setEditId(null);
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function removeCertificate(id: number) {
    if (!confirm(`Remove certificate ${id}?`)) return;
    await fetch(`/api/certificates/${id}/`, { method: "DELETE" });
    if (selectedId === id) await setSelectedId(null);
    await load();
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
        <Card className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">pje-officer (pjeoffice-pro emulator)</h1>
            <p className="text-sm text-slate-400">Certificate validation server with URL-based UI state.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void load()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Reload
            </Button>
            <Button onClick={() => void setAddOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Add certificate
            </Button>
          </div>
        </Card>

        <Card>
          <Input
            value={search}
            onChange={(event) => void setSearch(event.target.value)}
            placeholder="Filter by name, subject or issuer"
          />
        </Card>

        {error ? <Card className="border-red-700 text-red-300">{error}</Card> : null}
        {loading ? <Card>Loading...</Card> : null}

        {!loading && filtered.length === 0 ? <Card>No certificates configured.</Card> : null}

        {filtered.map((item) => (
          <Card
            key={item.id}
            className={`cursor-pointer ${selectedId === item.id ? "border-slate-400" : ""}`}
            onClick={() => void setSelectedId(item.id)}
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1">
                <h2 className="text-lg font-medium">#{item.id} - {item.name}</h2>
                <p className="text-sm text-slate-400">{item.subject}</p>
                <p className="text-xs text-slate-500">Issuer: {item.issuer}</p>
                <p className="text-xs text-slate-500">Valid: {new Date(item.validFrom).toLocaleString()} → {new Date(item.validTo).toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded px-2 py-1 text-xs ${item.isCurrentlyValid ? "bg-emerald-800 text-emerald-100" : "bg-amber-800 text-amber-100"}`}>
                  {item.isCurrentlyValid ? "Valid now" : "Expired/Not yet valid"}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={(event) => {
                    event.stopPropagation();
                    setEditId(item.id);
                    setAddOpen(true);
                    setForm((current) => ({ ...current, name: item.name }));
                  }}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={(event) => {
                    event.stopPropagation();
                    void removeCertificate(item.id);
                  }}
                >
                  <Trash2 className="mr-1 h-4 w-4" /> Remove
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={addOpen}>
        <h2 className="mb-4 text-lg font-semibold">{editId ? `Update certificate #${editId}` : "Add certificate"}</h2>
        <div className="space-y-3">
          <Input
            placeholder="Display name"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          />
          <Input
            type="password"
            placeholder="Certificate password"
            value={form.password}
            onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
          />
          <input
            type="file"
            accept=".pfx,.p12"
            className="block w-full text-sm text-slate-300 file:mr-4 file:rounded file:border-0 file:bg-slate-700 file:px-3 file:py-2 file:text-slate-100"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setForm((current) => ({ ...current, pfxBase64: "" }));
              const pfxBase64 = await toBase64(file);
              setForm((current) => ({ ...current, pfxBase64 }));
            }}
          />
          <p className="text-xs text-slate-500">To keep KISS, file bytes are sent as base64 directly to local API.</p>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setForm(initialForm);
              setAddOpen(false);
              setEditId(null);
            }}
          >
            Cancel
          </Button>
          <Button disabled={saving || !form.name || !form.password || (!editId && !form.pfxBase64)} onClick={() => void saveCertificate()}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </Modal>
    </main>
  );
}
