import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Filters, JobView, RenderSettings } from "../shared/config";
import {
  DEFAULT_COMPOSITION,
  DEFAULT_FRAMING,
  IMPACT_PRESET,
  HEAD_PROPORTIONS,
  NEUTRAL_PRESET,
  OUTPUT_FILENAME,
  SUBJECT_TOP,
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
  "detecting-objects": "Sprawdzanie dodatkowych obiektów",
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
  showValue = true,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  showValue?: boolean;
}) {
  return (
    <label className={`range${showValue ? "" : " slider-only"}`}>
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
      {showValue && (
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
      )}
    </label>
  );
}
function App() {
  const [status, setStatus] = useState<Status>();
  const [job, setJob] = useState<JobView>();
  const [photo, setPhoto] = useState<File>();
  const [source, setSource] = useState("");
  const [gradientPreview, setGradientPreview] = useState("");
  const [settings, setSettings] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [guides, setGuides] = useState(false);
  const lastAttempt = useRef<RenderSettings | undefined>(undefined);
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
      setSettings(initial());
      setDirty(false);
      const data = new FormData();
      data.set("photo", photo);
      setJob(await api("/api/jobs", { method: "POST", body: data }));
    });
  }
  async function render(next = settings) {
    await action(async () => {
      setJob(await api(`/api/jobs/${job!.id}/render`, json(next)));
      setSettings(next);
      setDirty(false);
    });
  }
  function update(next: RenderSettings) {
    setSettings(next);
    setDirty(true);
  }
  const processing = Boolean(
    job &&
    !["complete", "failed", "manual-review-required"].includes(job.state),
  );
  const editable = Boolean(job?.hasSubject) && !busy && !processing;
  useEffect(() => {
    if (!dirty || !editable || lastAttempt.current === settings) return;
    const timer = setTimeout(() => {
      lastAttempt.current = settings;
      void render(settings);
    }, 450);
    return () => clearTimeout(timer);
  }, [dirty, editable, settings]);
  async function download() {
    if (!job?.hasPreview || dirty) return;
    await action(async () => {
      const response = await fetch(`/api/jobs/${job.id}/download`);
      if (!response.ok) {
        const body = await response
          .json()
          .catch(() => ({ message: "Nie udało się pobrać PNG." }));
        throw new Error(body.message);
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = OUTPUT_FILENAME;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    });
  }
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
          <p className="eyebrow">Impact'27 · studio zdjęć</p>
          <h1>Zdjęcia prelegentów</h1>
          <p>Jedna sylwetka. Stałe tło. PNG 1600 × 1200.</p>
        </div>
        <span className="badge">PNG 1600 × 1200</span>
      </header>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      <div className="workspace">
        <aside className="controls">
          <section className="preparation-panel">
            <h2>
              <span className="step">1</span> Przygotowanie zdjęcia na Impact'27
            </h2>
            <form onSubmit={(e) => void start(e)}>
              <label className="file impact-upload">
                <input
                  aria-label="Wybierz zdjęcie"
                  type="file"
                  required
                  accept="image/png,image/jpeg,image/webp"
                  disabled={busy || processing}
                  onChange={(e) => setPhoto(e.target.files?.[0])}
                />
              </label>
              <div className="upload-detail">
                {gradientPreview && (
                  <img
                    className="gradient-preview"
                    src={gradientPreview}
                    alt="Podgląd stałego tła"
                  />
                )}
                <p className="hint">
                  JPEG, PNG lub WebP · do 20 MB.
                  <br />
                  Pionowe, poziome i kwadratowe zdjęcia; minimum 300 px na
                  krótszym boku.
                </p>
              </div>
              <div className="generate-action">
                <button
                  className="primary prepare-cta"
                  disabled={
                    busy || processing || !status?.hasGradient || !photo
                  }
                >
                  {busy || processing
                    ? "Przetwarzanie…"
                    : "GENERUJ GRAFIKĘ NA IMPACT'27"}
                </button>
              </div>
            </form>
          </section>
          <section className="framing-panel">
            <h2>
              <span className="step">2</span> Kadrowanie
            </h2>
            <Range
              label="WIELKOŚĆ SYLWETKI"
              min={HEAD_PROPORTIONS.min * 100}
              max={HEAD_PROPORTIONS.max * 100}
              step={1}
              showValue={false}
              value={Math.round(settings.framing.headRatio * 100)}
              disabled={!editable}
              onChange={(value) =>
                update({
                  ...settings,
                  framing: { ...settings.framing, headRatio: value / 100 },
                })
              }
            />
            <Range
              label="WYSOKOŚĆ SYLWETKI"
              min={0}
              max={100}
              showValue={false}
              value={Math.round(
                (100 * (SUBJECT_TOP.max - settings.composition.headTop)) /
                  (SUBJECT_TOP.max - SUBJECT_TOP.min),
              )}
              disabled={!editable}
              onChange={(value) =>
                update({
                  ...settings,
                  composition: {
                    ...settings.composition,
                    headTop: Math.round(
                      SUBJECT_TOP.max -
                        (value / 100) * (SUBJECT_TOP.max - SUBJECT_TOP.min),
                    ),
                  },
                })
              }
            />
            <div className="buttons">
              <button
                disabled={!editable}
                onClick={() =>
                  void render({
                    ...settings,
                    framing: { ...DEFAULT_FRAMING },
                    composition: { ...DEFAULT_COMPOSITION },
                  })
                }
              >
                Resetuj kadr
              </button>
            </div>
            <p className="hint">Podgląd aktualizuje się automatycznie.</p>
          </section>
          <section className="advanced-panel">
            {job?.hasSubject && job.head && (
              <details>
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
          </section>
          <section className="advanced-panel">
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
            <div className="preview-toolbar">
              <button
                className="download-cta"
                disabled={!job?.hasPreview || dirty || busy || processing}
                onClick={() => void download()}
              >
                POBIERZ PNG
              </button>
              <button aria-pressed={guides} onClick={() => setGuides(!guides)}>
                Prowadnice
              </button>
              {job && (
                <button
                  disabled={busy || processing}
                  onClick={() =>
                    void action(async () => {
                      await api(`/api/jobs/${job.id}`, { method: "DELETE" });
                      setJob(undefined);
                      setDirty(false);
                    })
                  }
                >
                  Usuń zdjęcie
                </button>
              )}
            </div>
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
                  <path
                    d={`M0 ${settings.composition.headTop} H1600 M1224 0 V1200`}
                  />
                  <text x="16" y={settings.composition.headTop - 15}>
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
            {dirty && <p className="notice">Aktualizowanie podglądu…</p>}
            {job?.error && <p className="notice error">{job.error.message}</p>}
            {job?.objectReport?.objects.length &&
            job.objectDecision === "pending" ? (
              <div className="object-notice" role="alert">
                <strong>
                  WYKRYTO OBIEKT NIE BĘDĄCY SYLWETKĄ, CZY ZGADASZ SIĘ NA RETUSZ
                  PRZY UŻYCIU AI?
                </strong>
                <p>
                  Możliwy obiekt:{" "}
                  {[
                    ...new Set(job.objectReport.objects.map((o) => o.label)),
                  ].join(", ")}
                  . Retusz AI nie jest wykonywany w tej wersji. Twoja odpowiedź
                  dotyczy tylko tego zdjęcia; pobieranie pozostaje dostępne.
                </p>
                <div className="buttons">
                  {(["accepted", "declined"] as const).map((decision) => (
                    <button
                      key={decision}
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          setJob(
                            await api(
                              `/api/jobs/${job.id}/object-decision`,
                              json({ decision }),
                            ),
                          );
                        })
                      }
                    >
                      {decision === "accepted" ? "ZGADZAM SIĘ" : "BEZ RETUSZU"}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {job?.objectDecision === "accepted" && (
              <p className="notice">
                Zgoda zapisana dla tego zdjęcia. Retusz AI nie jest uruchamiany
                w tej wersji.
              </p>
            )}
            {job?.objectReport?.message && (
              <details className="quality-notes">
                <summary>Wykrywanie obiektów</summary>
                <p className="hint">{job.objectReport.message}</p>
              </details>
            )}
            {job?.warnings.length ? (
              <details className="quality-notes">
                <summary>Uwagi do zdjęcia ({job.warnings.length})</summary>
                <ul className="notice">
                  {job.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </details>
            ) : null}
          </section>
          {source && (
            <details className="source">
              <summary>Zdjęcie źródłowe</summary>
              <img src={source} alt="Wgrane zdjęcie źródłowe prelegenta" />
            </details>
          )}
        </div>
      </div>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
