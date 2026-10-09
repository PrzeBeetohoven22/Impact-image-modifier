import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type {
  Filters,
  JobView,
  RenderSettings,
  GradientMode,
} from "../shared/config";
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
const labels: Record<Exclude<keyof Filters, "invert">, string> = {
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
  const [gradientMode, setGradientMode] = useState<GradientMode>("canvas");
  const [gradientPreview, setGradientPreview] = useState("");
  const [settings, setSettings] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [dirty, setDirty] = useState(false);
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
  async function uploadGradient(file?: File) {
    if (!file) return;
    await action(async () => {
      const data = new FormData();
      data.set("gradient", file);
      data.set("mode", gradientMode);
      await api("/api/gradient", { method: "POST", body: data });
      setStatus(await api("/api/status"));
      setGradientPreview(`/api/gradient/preview?v=${Date.now()}`);
    });
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
  const editable = Boolean(job?.hasPreview) && !busy && !processing;
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
            <label>
              Materiał tła
              <select
                value={gradientMode}
                disabled={busy || processing}
                onChange={(e) =>
                  setGradientMode(e.target.value as GradientMode)
                }
              >
                <option value="canvas">Gotowe tło 1600 × 1200</option>
                <option value="cutout">
                  Wycinek gradientu — pomiń czarne marginesy
                </option>
              </select>
            </label>
            {gradientMode === "cutout" && (
              <p className="hint">
                Usuniemy zewnętrzne czarne marginesy i wypełnimy płótno 4:3
                proporcjonalnie. Nadmiar przytniemy symetrycznie, bez
                rozciągania i filtrów. Sprawdź podgląd po imporcie.
              </p>
            )}
            <label className="file">
              {gradientMode === "cutout"
                ? "Plik wycinka gradientu"
                : "Zatwierdzone tło 1600 × 1200 (opcjonalnie)"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={busy || processing}
                onChange={(e) => void uploadGradient(e.target.files?.[0])}
              />
            </label>
            <p className="hint">
              {status?.hasGradient
                ? status.gradientSource === "default"
                  ? "Wybrany gradient Impact jest gotowy do użycia. Możesz od razu wgrać zdjęcie prelegenta."
                  : "Tło wgrane. Zachowamy jego kolory i układ."
                : gradientMode === "cutout"
                  ? "Wgraj wybrany wycinek gradientu jako PNG, JPEG lub WebP."
                  : "Wgraj plik tła z gradientem Impact, przygotowany w docelowych proporcjach 4:3."}
            </p>
            {gradientPreview && (
              <img
                className="gradient-preview"
                src={gradientPreview}
                alt="Podgląd tła po imporcie"
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
            <Range
              label="Powiększenie"
              min={0.5}
              max={2}
              step={0.01}
              value={settings.framing.zoom}
              disabled={!editable}
              onChange={(zoom) =>
                update({ ...settings, framing: { ...settings.framing, zoom } })
              }
            />
            <Range
              label="Pozycja pozioma"
              min={-800}
              max={800}
              value={settings.framing.x}
              disabled={!editable}
              onChange={(x) =>
                update({ ...settings, framing: { ...settings.framing, x } })
              }
            />
            <Range
              label="Pozycja pionowa"
              min={-600}
              max={600}
              value={settings.framing.y}
              disabled={!editable}
              onChange={(y) =>
                update({ ...settings, framing: { ...settings.framing, y } })
              }
            />
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
            <details>
              <summary>Reguły kompozycji</summary>
              <p className="hint">
                Pozycje w pikselach płótna 1600 × 1200. Wartości wyjściowe
                wymagają zatwierdzenia na docelowym przykładzie.
              </p>
              {(
                [
                  "targetX",
                  "targetBottom",
                  "maxSubjectWidth",
                  "maxSubjectHeight",
                  "faceTargetX",
                  "faceTargetY",
                  "minimumHeadMargin",
                  "placementTolerance",
                ] as const
              ).map((key, i) => (
                <label key={key}>
                  {
                    [
                      "Środek sylwetki X",
                      "Dolna krawędź sylwetki",
                      "Maksymalna szerokość",
                      "Maksymalna wysokość",
                      "Środek twarzy X",
                      "Środek twarzy Y",
                      "Margines nad głową",
                      "Tolerancja pozycji",
                    ][i]
                  }
                  <input
                    type="number"
                    disabled={!editable}
                    value={settings.composition[key]}
                    onChange={(e) =>
                      update({
                        ...settings,
                        composition: {
                          ...settings.composition,
                          [key]: Number(e.target.value),
                        },
                      })
                    }
                  />
                </label>
              ))}
              <label>
                Punkt odniesienia
                <select
                  disabled={!editable}
                  value={settings.composition.anchor}
                  onChange={(e) =>
                    update({
                      ...settings,
                      composition: {
                        ...settings.composition,
                        anchor: e.target.value as "face" | "subject",
                      },
                    })
                  }
                >
                  <option value="face">Twarz, jeśli wykryta</option>
                  <option value="subject">Sylwetka</option>
                </select>
              </label>
              <label>
                Kadrowanie
                <select
                  disabled={!editable}
                  value={settings.composition.crop}
                  onChange={(e) =>
                    update({
                      ...settings,
                      composition: {
                        ...settings.composition,
                        crop: e.target.value as "contain" | "allow-bottom",
                      },
                    })
                  }
                >
                  <option value="allow-bottom">
                    Dopuszczaj przycięcie dołu
                  </option>
                  <option value="contain">Zmieszczaj sylwetkę</option>
                </select>
              </label>
            </details>
          </section>
          <section>
            <details>
              <summary>Filtry sylwetki</summary>
              <p className="hint">
                Preset z dostarczonych ustawień. Sprawdź efekt na zdjęciu
                prelegenta. Filtry nie zmieniają tła.
              </p>
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
            <div className="preview">
              {job?.hasPreview ? (
                <img
                  src={`/api/jobs/${job.id}/preview?v=${job.revision}`}
                  alt="Podgląd gotowego kadru prelegenta"
                />
              ) : (
                <div className="empty">
                  <span aria-hidden="true">▧</span>
                  <p>Tu pojawi się przygotowany kadr</p>
                  <p className="hint">
                    Dodaj jedno zdjęcie prelegenta.
                  </p>
                </div>
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
              (job.analysis?.people ?? 0) <= 1 && (
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
              job?.hasPreview && (
                <p className="hint">PNG 1600 × 1200 · sRGB</p>
              )
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
        Sprawdź włosy, dłonie i krawędzie ubrania przed użyciem grafiki. Preset
        i kompozycja oczekują na kalibrację z zatwierdzonym materiałem.
      </footer>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
