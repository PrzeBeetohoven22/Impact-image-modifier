import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Filters, JobView, RenderSettings } from "../shared/config";
import {
  DEFAULT_COMPOSITION,
  DEFAULT_FRAMING,
  IMPACT_PRESET,
  NEUTRAL_PRESET,
} from "../shared/config";
import "./styles.css";
type Status = {
  hasGradient: boolean;
  gradientSource: "default" | "uploaded" | null;
  canvaConfigured: boolean;
  canvaConnected: boolean;
};
const stateLabels: Record<JobView["state"], string> = {
  idle: "Gotowe do rozpoczęcia",
  uploading: "Wgrywanie zdjęcia",
  validating: "Sprawdzanie zdjęcia i liczby osób",
  "removing-background": "Usuwanie tła",
  composing: "Przygotowywanie kadru",
  "creating-canva-design": "Tworzenie projektu Canva",
  exporting: "Eksport z Canva",
  complete: "PNG gotowy",
  "manual-review-required": "Zdjęcie wymaga sprawdzenia",
  failed: "Przetwarzanie nie powiodło się",
};
const labels: Record<Exclude<keyof Filters, "invert" | "denoise">, string> = {
  temperature: "Temperatura",
  tint: "Odcień",
  brightness: "Jasność",
  contrast: "Kontrast",
  highlights: "Światła",
  shadows: "Cienie",
  whites: "Biel",
  blacks: "Czerń",
  vibrance: "Jaskrawość",
  saturation: "Nasycenie",
  sharpness: "Ostrość",
  clarity: "Przejrzystość",
  vignette: "Winieta",
};
async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const r = await fetch(path, options);
  if (!r.ok) {
    const e = await r
      .json()
      .catch(() => ({ message: "Nie udało się połączyć z serwerem." }));
    throw new Error(e.message);
  }
  return r.status === 204 ? (undefined as T) : r.json();
}
const json = (body: unknown) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const initial = (): RenderSettings => ({
  framing: { ...DEFAULT_FRAMING },
  filters: { ...IMPACT_PRESET },
  composition: { ...DEFAULT_COMPOSITION },
});
function Range({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className="range">
      <span>{label}</span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <input
        type="number"
        aria-label={`${label} — wartość`}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v) && v >= min && v <= max) onChange(v);
        }}
      />
    </label>
  );
}
function App() {
  const [status, setStatus] = useState<Status>();
  const [job, setJob] = useState<JobView>();
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState<File>();
  const [source, setSource] = useState("");
  const [mode, setMode] = useState("auto");
  const [gradientPreview, setGradientPreview] = useState("");
  const [settings, setSettings] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [guides, setGuides] = useState(true);
  useEffect(() => {
    void api<Status>("/api/status")
      .then((value) => {
        setStatus(value);
        if (value.hasGradient) setGradientPreview("/api/gradient/preview");
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!photo) {
      setSource("");
      return;
    }
    const url = URL.createObjectURL(photo);
    setSource(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  useEffect(() => {
    if (
      !job ||
      ["complete", "failed", "manual-review-required"].includes(job.state)
    )
      return;
    let alive = true;
    const interval = setInterval(() => {
      void api<JobView>(`/api/jobs/${job.id}`)
        .then((j) => {
          if (alive) setJob(j);
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    }, 700);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [job?.id, job?.state]);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wystąpił błąd.");
    } finally {
      setBusy(false);
    }
  }
  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (!photo) return;
    await action(async () => {
      if (job) await api(`/api/jobs/${job.id}`, { method: "DELETE" });
      setJob(undefined);
      setConfirm(false);
      setSettings(initial());
      setDirty(false);
      const data = new FormData();
      data.set("photo", photo);
      data.set("name", name);
      data.set("mode", mode);
      setJob(await api("/api/jobs", { method: "POST", body: data }));
    });
  }
  async function render(next = settings) {
    await action(async () => {
      setJob(await api(`/api/jobs/${job!.id}/render`, json(next)));
      setSettings(next);
      setDirty(false);
      setConfirm(false);
    });
  }
  function update(next: RenderSettings) {
    setSettings(next);
    setDirty(true);
    setConfirm(false);
  }
  const processing = Boolean(
    job &&
    !["complete", "failed", "manual-review-required"].includes(job.state),
  );
  const editable = Boolean(job?.hasSubject) && !busy && !processing;
  const measurementTop = settings.framing.headTop ?? job?.head?.top ?? 0;
  const measurementChin =
    settings.framing.chin ??
    job?.head?.chin ??
    Math.round(
      measurementTop + ((job?.head?.sourceHeight ?? 0) - measurementTop) * 0.3,
    );
  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">Narzędzie produkcyjne</p>
          <h1>Zdjęcia prelegentów</h1>
          <p>Jedna sylwetka. Stałe tło. PNG 1600 × 1200.</p>
        </div>
        <span className="badge">Wersja robocza interfejsu</span>
      </header>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      <div className="workspace">
        <aside>
          <section>
            <h2>
              <span className="step">1</span> Tło i zdjęcie
            </h2>
            <p className="hint">
              Wybrany gradient Impact jest gotowy do użycia. Kwadrat ma stałą
              pozycję; kolory i tło pozostają takie same dla każdego prelegenta.
            </p>
            {gradientPreview && (
              <img
                className="gradient-preview"
                src={gradientPreview}
                alt="Podgląd stałego tła"
              />
            )}
            <form onSubmit={(e) => void start(e)}>
              <label>
                Imię i nazwisko
                <input
                  required
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nazwa prelegenta"
                />
              </label>
              <label className="file">
                Zdjęcie prelegenta
                <input
                  type="file"
                  required
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => setPhoto(e.target.files?.[0])}
                />
              </label>
              <label>
                Przygotowanie sylwetki
                <select value={mode} onChange={(e) => setMode(e.target.value)}>
                  <option value="auto">Automatyczne usunięcie tła</option>
                  <option value="transparent">PNG z już usuniętym tłem</option>
                </select>
              </label>
              <p className="hint">
                JPEG, PNG lub WebP · do 20 MB · minimum 300 px na krótszym boku.
                Pliki są usuwane z pamięci po 20 minutach.
              </p>
              <button
                className="primary"
                disabled={
                  busy ||
                  processing ||
                  !status?.hasGradient ||
                  !photo ||
                  !name.trim()
                }
              >
                {busy ? "Przetwarzanie…" : "Przygotuj zdjęcie"}
              </button>
            </form>
          </section>
          <section>
            <h2>
              <span className="step">2</span> Kadrowanie
            </h2>
            <p className="hint">
              Czubek głowy, prawy skraj i dolna krawędź są stałe. Zmieniamy
              wyłącznie proporcjonalne powiększenie i przycięcie dołu zdjęcia.
            </p>
            <Range
              label="Wysokość głowy (% sylwetki)"
              min={30}
              max={45}
              step={1}
              value={Math.round(settings.framing.headRatio * 100)}
              disabled={!editable}
              onChange={(value) =>
                update({
                  ...settings,
                  framing: { ...settings.framing, headRatio: value / 100 },
                })
              }
            />
            {job?.layout && (
              <p className="hint">
                Głowa w wyniku: {(job.layout.headRatio * 100).toFixed(1)}%
                wysokości widocznej sylwetki.
              </p>
            )}
            <div className="buttons">
              <button disabled={!editable} onClick={() => void render()}>
                Aktualizuj podgląd{dirty ? " •" : ""}
              </button>
              <button
                disabled={!editable}
                onClick={() =>
                  void render({ ...settings, framing: { ...DEFAULT_FRAMING } })
                }
              >
                Resetuj kadr
              </button>
            </div>
            {job?.hasSubject && job.head && (
              <details open={job.error?.code === "HEAD_MEASUREMENT_REQUIRED"}>
                <summary>Pomiar głowy: włosy–broda</summary>
                <p className="hint">
                  Sprawdź czubek włosów i spód brody. Linie służą do kadrowania;
                  nie zmieniają rysów ani proporcji zdjęcia. Przy braku wykrytej
                  twarzy ustaw brodę ręcznie.
                </p>
                <div className="head-reference">
                  <img
                    src={`/api/jobs/${job.id}/subject`}
                    alt="Sylwetka do sprawdzenia pomiaru głowy"
                  />
                  <span
                    className="measurement-line hair"
                    style={{
                      top: `${(measurementTop / job.head.sourceHeight) * 100}%`,
                    }}
                  >
                    Włosy
                  </span>
                  <span
                    className="measurement-line chin"
                    style={{
                      top: `${(measurementChin / job.head.sourceHeight) * 100}%`,
                    }}
                  >
                    Broda
                  </span>
                </div>
                <Range
                  label="Czubek włosów (% wysokości zdjęcia)"
                  min={0}
                  max={99}
                  step={0.1}
                  value={
                    Math.round(
                      (measurementTop / job.head.sourceHeight) * 1000,
                    ) / 10
                  }
                  disabled={!editable}
                  onChange={(value) =>
                    update({
                      ...settings,
                      framing: {
                        ...settings.framing,
                        headTop: Math.round(
                          (value / 100) * job.head!.sourceHeight,
                        ),
                      },
                    })
                  }
                />
                <Range
                  label="Spód brody (% wysokości zdjęcia)"
                  min={0.1}
                  max={100}
                  step={0.1}
                  value={
                    Math.round(
                      (measurementChin / job.head.sourceHeight) * 1000,
                    ) / 10
                  }
                  disabled={!editable}
                  onChange={(value) =>
                    update({
                      ...settings,
                      framing: {
                        ...settings.framing,
                        chin: Math.round(
                          (value / 100) * job.head!.sourceHeight,
                        ),
                      },
                    })
                  }
                />
                <button
                  disabled={!editable}
                  onClick={() =>
                    void render({
                      ...settings,
                      framing: {
                        ...settings.framing,
                        headTop: measurementTop,
                        chin: measurementChin,
                      },
                    })
                  }
                >
                  Zastosuj pomiar głowy
                </button>
              </details>
            )}
            <details>
              <summary>Stałe reguły układu</summary>
              <p className="hint">
                Gradient: 1080 × 1080 px, x = 0, y = 120. Czubek głowy: y = 240.
                Prawy skraj sylwetki: x = 1224. Dół sylwetki: y = 1200. Głowa:
                docelowo 30%, maksymalnie 45% widocznej sylwetki.
              </p>
            </details>
          </section>
          <section>
            <details>
              <summary>Filtry sylwetki</summary>
              <p className="hint">
                Preset z dostarczonych ustawień. Sprawdź efekt na zdjęciu
                prelegenta. Filtry nie zmieniają tła.
              </p>
              <label className="check">
                <input
                  type="checkbox"
                  checked={settings.filters.denoise}
                  disabled={!editable}
                  onChange={(e) =>
                    update({
                      ...settings,
                      filters: {
                        ...settings.filters,
                        denoise: e.target.checked,
                      },
                    })
                  }
                />
                Delikatnie zmniejsz ziarnistość
              </label>
              {(Object.keys(labels) as (keyof typeof labels)[]).map((key) => (
                <Range
                  key={key}
                  label={labels[key]}
                  value={settings.filters[key]}
                  min={key === "sharpness" || key === "vignette" ? 0 : -100}
                  max={100}
                  disabled={!editable}
                  onChange={(v) =>
                    update({
                      ...settings,
                      filters: { ...settings.filters, [key]: v },
                    })
                  }
                />
              ))}
              <label className="check">
                <input
                  type="checkbox"
                  checked={settings.filters.invert}
                  disabled={!editable}
                  onChange={(e) =>
                    update({
                      ...settings,
                      filters: {
                        ...settings.filters,
                        invert: e.target.checked,
                      },
                    })
                  }
                />
                Odwróć kolory
              </label>
              <div className="buttons">
                <button
                  disabled={!editable}
                  onClick={() =>
                    void render({ ...settings, filters: { ...IMPACT_PRESET } })
                  }
                >
                  Preset ze zrzutów
                </button>
                <button
                  disabled={!editable}
                  onClick={() =>
                    void render({ ...settings, filters: { ...NEUTRAL_PRESET } })
                  }
                >
                  Bez filtrów
                </button>
                <button disabled={!editable} onClick={() => void render()}>
                  Zastosuj filtry
                </button>
              </div>
            </details>
          </section>
        </aside>
        <div className="results">
          <section className="preview-panel">
            <div className="panel-heading">
              <h2>Podgląd wyniku</h2>
              <span className="badge">4:3 · 1600 × 1200 px</span>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={guides}
                onChange={(e) => setGuides(e.target.checked)}
              />
              Pokaż prowadnice (nie pojawią się w PNG)
            </label>
            <div className="preview">
              {job?.hasPreview ? (
                <img
                  src={`/api/jobs/${job.id}/preview?v=${job.revision}`}
                  alt="Podgląd gotowego kadru prelegenta"
                />
              ) : gradientPreview ? (
                <img
                  src={gradientPreview}
                  alt="Stały układ tła przed dodaniem prelegenta"
                />
              ) : (
                <div className="empty">
                  <p>Dodaj jedno zdjęcie prelegenta.</p>
                </div>
              )}
              {guides && (
                <svg
                  className="layout-guides"
                  viewBox="0 0 1600 1200"
                  aria-hidden="true"
                >
                  <rect x="0" y="120" width="1080" height="1080" />
                  <path d="M0 240 H1600 M1224 0 V1200" />
                  <text x="16" y="225">
                    Czubek głowy
                  </text>
                  <text x="1240" y="50">
                    Prawy skraj
                  </text>
                </svg>
              )}
            </div>
            <div role="status" aria-live="polite" className="status">
              {busy
                ? "Przetwarzanie…"
                : job
                  ? stateLabels[job.state]
                  : "Wybierz zdjęcie prelegenta, aby rozpocząć."}
            </div>
            {dirty && (
              <p className="notice">
                Ustawienia kadru lub filtrów zmieniły się. Aktualizuj podgląd
                przed pobraniem.
              </p>
            )}
            {job?.error && <p className="notice error">{job.error.message}</p>}
            {job?.warnings.length ? (
              <ul className="notice">
                {job.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            ) : null}
            {job?.state === "manual-review-required" &&
              (job.analysis?.people ?? 0) <= 1 &&
              (!job.hasSubject || job.hasPreview) && (
                <div className="notice">
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={confirm}
                      onChange={(e) => setConfirm(e.target.checked)}
                    />
                    Sprawdziłem zdjęcie: jedna osoba, poprawna sylwetka i
                    widoczna głowa.
                  </label>
                  <button
                    disabled={!confirm || busy || dirty}
                    onClick={() =>
                      void action(async () => {
                        setJob(
                          await api(
                            `/api/jobs/${job.id}/review`,
                            json({ confirmSinglePerson: true }),
                          ),
                        );
                      })
                    }
                  >
                    Potwierdź i kontynuuj
                  </button>
                </div>
              )}
          </section>
          <section>
            <h2>
              <span className="step">3</span> Pobieranie
            </h2>
            <div className="buttons">
              {job?.state === "complete" && !dirty ? (
                <a
                  className="button primary"
                  href={`/api/jobs/${job.id}/download`}
                >
                  Pobierz PNG
                </a>
              ) : (
                <button disabled>Pobierz PNG</button>
              )}
              {status?.canvaConfigured && (
                <>
                  <a className="button" href="/api/canva/connect">
                    {status.canvaConnected
                      ? "Połącz ponownie z Canva"
                      : "Połącz z Canva"}
                  </a>
                  <button
                    disabled={
                      !status.canvaConnected ||
                      job?.state !== "complete" ||
                      busy ||
                      dirty ||
                      job.canvaState === "complete"
                    }
                    onClick={() =>
                      void action(async () => {
                        setJob(
                          await api(`/api/jobs/${job!.id}/canva`, {
                            method: "POST",
                          }),
                        );
                      })
                    }
                  >
                    Utwórz projekt Canva i eksportuj
                  </button>
                </>
              )}
              {job && (
                <button
                  disabled={busy || processing}
                  onClick={() =>
                    void action(async () => {
                      await api(`/api/jobs/${job.id}`, { method: "DELETE" });
                      setJob(undefined);
                      setConfirm(false);
                    })
                  }
                >
                  Usuń zdjęcie z serwera
                </button>
              )}
            </div>
            {status?.canvaConfigured ? (
              <>
                {job?.canvaError && (
                  <p className="notice error">{job.canvaError.message}</p>
                )}
                {job?.canvaDesign && (
                  <p>
                    <a
                      href={job.canvaDesign.editUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Otwórz edytowalny projekt Canva ↗
                    </a>
                  </p>
                )}
                {job?.canvaState === "complete" ? (
                  <p className="hint">
                    Projekt Canva utworzony. Pobieranie zawiera zweryfikowany
                    eksport Canva.
                  </p>
                ) : (
                  job?.hasPreview && (
                    <p className="hint">
                      Podgląd i pobieranie przedstawiają lokalny PNG.
                    </p>
                  )
                )}
              </>
            ) : (
              job?.hasPreview && <p className="hint">PNG 1600 × 1200 · sRGB</p>
            )}
          </section>
          {source && (
            <details className="source">
              <summary>Zdjęcie źródłowe</summary>
              <img src={source} alt="Wgrane zdjęcie źródłowe prelegenta" />
            </details>
          )}
        </div>
      </div>
      <footer>
        Sprawdź włosy, dłonie i krawędzie ubrania przed użyciem grafiki.
        Pomiar głowy i wygląd filtrów oceń na swoim zdjęciu źródłowym.
      </footer>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
