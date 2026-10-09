# Impact image modifier

Działająca aplikacja robocza do przygotowania zdjęcia jednego prelegenta: walidacja → wykrycie osób i twarzy → lokalne usunięcie tła → filtry sylwetki → korekta kadru → PNG **1600 × 1200, sRGB, bez przezroczystości**. Opcjonalna integracja Canva Connect tworzy projekt z szablonu marki i pobiera zweryfikowany eksport. Interfejs używa KV Impact'27: Raleway Light, wąskich nagłówków oraz czerwieni i gradientu marki.

Domyślna wersja do testów działa samodzielnie, bez konta, szablonu i kluczy Canva. Aplikacja sama łączy sylwetkę z wybranym gradientem i zapisuje wynik. Frontend korzysta z lokalnego eksportu PNG; opcjonalne API Canva pozostaje oddzielną integracją.

Najprostsza ścieżka pierwszych testów w przeglądarce: **GitHub Codespaces**, bez osobnego hostingu. [Instrukcja krok po kroku](docs/PIERWSZE-URUCHOMIENIE.html) obejmuje pobranie paczki, upload kodu i otwarcie prywatnego podglądu. Konfiguracja `.devcontainer` wybiera Node 24, instaluje zależności i buduje aplikację. Następnie w terminalu Codespaces uruchom `bash .devcontainer/start.sh` i otwórz port 3001 z panelu Ports. URL działa podczas uruchomionej sesji; Codespaces ma limity użycia zależne od konta. Faktyczne utworzenie sesji na koncie GitHub nie zostało wykonane w tej instancji.

**Jeśli kod jest już na GitHub, możesz od razu uruchomić testy:**

1. Na stronie repozytorium kliknij **Code → Codespaces → Create codespace on main**.
2. Poczekaj na instalację, otwórz **Terminal → New Terminal** i wpisz `bash .devcontainer/start.sh`.
3. W panelu **Ports** otwórz port **3001** przez **Open in Browser**. Pozostaw dostęp **Private**.
4. Wybierz zdjęcie prelegenta, kliknij **GENERUJ GRAFIKĘ NA IMPACT'27**, sprawdź kadr i kliknij **Pobierz PNG**.
5. Po zakończeniu wejdź na [github.com/codespaces](https://github.com/codespaces) i wybierz **… → Stop codespace** przy tej sesji.

[Instrukcja PDF](docs/PIERWSZE-URUCHOMIENIE.pdf) zawiera szczegółowe kroki i pomoc. Gdy repozytorium zawiera już pliki aplikacji, pomiń w niej kroki 1–2 i zacznij od **kroku 3: Utwórz środowisko Codespaces**. Kopię kodu pobierzesz z GitHub przez **Code → Download ZIP**.

**Aktualizacja działającej sesji Codespaces:** w terminalu aplikacji naciśnij **Control + C**, a następnie wykonaj:

```sh
git pull --ff-only origin main && bash .devcontainer/setup.sh && bash .devcontainer/start.sh
```

Po ponownym uruchomieniu odśwież kartę aplikacji i wybierz zdjęcie jeszcze raz. Restart usuwa bieżące zadania. Pobranie zmian jest bezpieczne dla lokalnych edycji: jeśli Git zgłosi konflikt, zatrzymaj się i sprawdź komunikat.

**Jeśli po drugim zdjęciu pojawiło się `Segmentation fault (core dumped)`:** wcześniejsza wersja ładowała do jednego procesu dwie różne natywne biblioteki ONNX (1.17 dla usuwania tła i 1.21 dla wykrywania przedmiotów). Odtworzono awarię przy kolejnym wywołaniu usuwania tła. Modele działają teraz w osobnych procesach, uruchamianych automatycznie przez serwer. Nie zmieniono zależności; jeśli poprzednia instalacja się zakończyła, wystarczy w terminalu Codespaces wykonać:

```sh
git pull --ff-only origin main && npm run build && bash .devcontainer/start.sh
```

Odśwież dotychczasowy URL portu 3001 i wgraj zdjęcie ponownie. Przy awarii dodatkowego detektora nadal powstaje PNG, pojawia się informacja o ograniczonym wykrywaniu, a model jest uruchamiany ponownie przy następnym zdjęciu. Awaria usuwania tła kończy tylko bieżące zadanie i pozwala spróbować ponownie. Zawieszony model jest zatrzymywany po 120 sekundach.

Proxy Codespaces może zmienić nagłówek Origin na lokalny adres serwera. Aplikacja dopuszcza tę zmianę wyłącznie w Codespaces, dla żądań przeglądarki oznaczonych `Sec-Fetch-Site: same-origin` i lokalnego portu tej aplikacji. Obce strony, inne porty i nagłówki `X-Forwarded-Host` nie uprawniają do obejścia kontroli.

## Uruchomienie

W katalogu tego repozytorium użyj Node **24** i npm **11**:

```sh
npm_config_onnxruntime_node_install_cuda=skip npm ci --cache /workspace/.npm-cache
npm run check:models
npm run setup:objects
npm run dev
```

Development: Vite na porcie 5173, API na 3001. `npm run build && npm start` obsługuje również gotowy interfejs z serwera na porcie 3001. Domyślnie serwery nasłuchują tylko na interfejsie loopback. Podczas wdrożenia ustaw `HOST`, właściwy `APP_ORIGIN` i HTTPS. Narzędzie nie ma zewnętrznej kontroli dostępu: dla hostowania poza lokalnym developmentem wymagany jest wewnętrzny reverse proxy/SSO, ograniczenia zasobów i HTTPS.

Flaga instalacji pomija opcjonalne biblioteki CUDA: pipeline używa CPU oraz WASM, nie wymaga GPU. Podstawowe wagi są częścią paczek npm. Dodatkowy model lokalnego wykrywania mikrofonów pobiera się raz poleceniem `npm run setup:objects`; instalator Codespaces próbuje zrobić to automatycznie. Podczas przetwarzania zdjęć żadne obrazy ani modele nie są wysyłane lub pobierane z zewnętrznych serwisów. Instalacja zachowuje TLS i sprawdzanie integralności lockfile.

Cloud task jest już izolowany. Używaj istniejącego checkoutu; nie twórz worktree bez wyraźnego polecenia użytkownika. Procesy nie są częścią snapshotu i trzeba je uruchamiać ponownie.

## Pierwsze zdjęcie

1. Tło jest gotowe i zablokowane: biały obszar 1600 × 1200 oraz pełny, oryginalny kwadrat gradientu 1080 × 1080 w punkcie (0, 120). Nie trzeba go wgrywać.
2. W sekcji **Przygotowanie zdjęcia na Impact'27** wybierz plik JPEG, PNG lub WebP: pionowy, poziomy albo kwadratowy. Limit to 20 MB, 40 megapikseli i minimum 300 px na krótszym boku. Kliknij **GENERUJ GRAFIKĘ NA IMPACT'27**. Przezroczyste sylwetki są rozpoznawane automatycznie.
3. Poczekaj na podgląd. Przy kilku wykrytych osobach potrzebne jest osobne zdjęcie prelegenta. Brak wykrytej twarzy uruchamia przybliżone kadrowanie i nie blokuje pobrania.
4. Dostosuj dwa suwaki: **WIELKOŚĆ SYLWETKI** (zakres wewnętrzny 15–75, domyślnie 45, bez procentów w interfejsie) oraz **WYSOKOŚĆ SYLWETKI** (czubek y = 174–660, od 5% do 50% wysokości gradientu). Podgląd aktualizuje się automatycznie. Szerokie zdjęcia mogą być przycinane po lewej; ciasne źródła nie są już odrzucane przez limit 65%. Skalowanie pozostaje proporcjonalne.
5. Opcjonalnie rozwiń **Pomiar głowy: włosy–broda** lub **Filtry sylwetki**. Pomiar jest szacunkiem; możesz poprawić linie. Wcześniejszy preset pozostaje domyślny.
6. Kliknij **POBIERZ PNG** nad podglądem. Plik ma nazwę **Impact'27 photo.png**. Ostrzeżenia i komunikat o dodatkowym obiekcie nie wymagają checkboxa i nie blokują eksportu. Przy lokalnej detekcji obiektu możesz odpowiedzieć na pytanie o zgodę na retusz; ta wersja zapisuje wyłącznie odpowiedź, nie wykonuje retuszu ani nie wysyła zdjęcia.

[Wykrywanie obiektów](docs/OBIEKTY.md) opisuje dodatkowy model, instalację i ograniczenia detekcji.
[Zasady i plan tej iteracji](docs/ITERACJA-KADROWANIA.md) opisują geometrię i dalsze porównania na prawdziwych zdjęciach. Canva pozostaje opcjonalna; jej szablon powinien mieć ten sam stały układ.

Po udanej segmentacji źródło jest zwalniane z pamięci. Sylwetka, tło i wynik pozostają tylko w sesji procesu przez maksymalnie 20 minut; możesz usunąć je wcześniej przyciskiem. Nie zapisujemy zdjęć na dysku. Cookie sesji jest podpisane, HttpOnly i SameSite. Połączenie Canva świadomie zapisuje asset i design na zdalnym koncie; ich retencja podlega Canva i nie jest objęta lokalnym usuwaniem.

## Architektura i konfiguracja

- `src/client/`: React / TypeScript / Vite, styl według KV Impact'27: gradientowy nagłówek, czerwone panele, przyciski z białą obwódką. Fonty Raleway Light i Barlow Condensed Bold są dołączone lokalnie z licencjami OFL.
- `src/server/app.ts`: API, prywatne sesje, ograniczona kolejka operacji, statusy i retencja.
- `src/server/providers.ts`: wymienne `BackgroundRemovalProvider` i `SubjectAnalysisProvider`. Usuwanie tła: **IMG.LY background-removal-node / ISNet, ONNX CPU**; detekcja: **Human / BlazeFace + CenterNet, WASM**. Wyłączono opisy, rozpoznawanie tożsamości, analizę emocji i wszystkie zbędne modele. Nie używamy LLM ani generatora obrazów.
- `src/server/native-process.ts`, `native-worker.ts`, `native-models.ts`: osobne procesy dla ISNet i OWL-ViT, transport zdjęć przez IPC w pamięci, limit czasu, odtworzenie procesu po awarii oraz zamknięcie razem z aplikacją. Wątki robocze nie zapewniałyby izolacji natywnych bibliotek.
- `src/server/images.ts`: walidacja typu na podstawie rzeczywistego dekodowania, EXIF, granice alfa, geometria kadru, filtry i eksport.
- `src/server/canva.ts`: serwerowe OAuth z PKCE, upload osobnej warstwy PNG, stabilne Autofill z brand template i asynchroniczny export; brak browser automation.
- `src/shared/config.ts`: płótno, kompozycja, wartości suwaków oraz walidacja konfiguracji. Pozycje tła i kotwice sylwetki są stałe; API odrzuca ich zmianę.

Preset zachowuje wartości dostarczonych suwaków: temperatura 13, odcień 0, jasność −8, kontrast −12, światła 3, cienie 6, biel −15, czerń 0, jaskrawość 15, nasycenie −63, odwrócenie wyłączone, ostrość 20, przejrzystość 0, winieta 0. Lokalny renderer ma własną, deterministyczną mapę tych wartości — **nie jest skalibrowany do algorytmu Canva**. Nie dodano nieznanych wartości edycji poszczególnych kolorów. Delikatne odszumianie jest domyślnie wyłączone i obejmuje wyłącznie wnętrze nieprzezroczystej maski. Filtry nie modyfikują tła. Usuwanie tła wykorzystuje wyłącznie maskę alfa modelu i zachowuje źródłowe RGB. Przeskalowanie i wycięcie nie regenerują twarzy; należy sprawdzić jakość maski na docelowych zdjęciach.

Konfiguracja środowiska jest opisana w [.env.example](.env.example). Do wersji samodzielnej pozostaw zmienne Canva puste. Sekrety pozostają na serwerze, nie wpisuj ich do kodu, czatu ani zmiennych `VITE_*`. Opcjonalna integracja Canva wymaga własnego Client ID, sekretu, adresu callback i Brand Template ID. Enterprise lub aktywny trial Autofill należy potwierdzić; Canva Business nie gwarantuje dostępu produkcyjnego.

Biblioteka IMG.LY jest na licencji **AGPL**; przed udostępnieniem narzędzia sprawdź zgodność sposobu użytkowania lub wybierz komercyjną licencję/inny provider. Human jest na MIT; uwzględnij informacje o modelach zawarte w paczce. Lockfile wymusza poprawione Sharp, Zod, Lodash i shell-quote przez overrides; kompatybilność jest sprawdzana przez `check:models` i testy.

## Walidacja

```sh
npm run lint
npm run typecheck
npm run test
npm run check:models
npm run build
npm run test:browser
```

Testy jednostkowe i HTTP obejmują EXIF, niedozwolone pliki, fałszywy MIME, granice przezroczystości, skalowanie i kadrowanie, niezmienione piksele tła, PNG/sRGB, prywatność sesji, wiele osób, ręczną akceptację, usuwanie plików oraz odpowiedzi API Canva. Przykłady geometryczne w testach nie są produkcyjnymi materiałami Impact. Test przeglądarki korzysta z prawdziwych lokalnych modeli i kontrolowanej wyciętej sylwetki; sprawdza również ręczne potwierdzenie i pobranie obrazu.

`check:models` rzeczywiście ładuje modele i wykonuje wnioskowanie. Opcjonalny argument ścieżki pozwala sprawdzić zdjęcie jednej osoby; wycięty plik testowy trafia wyłącznie do `/tmp/impact-isolated-test.png`. Próba modelu na obcym obrazie diagnostycznym nie oznacza kalibracji na zdjęciu użytkownika.

`npm run check:pipeline -- sciezka-do-zdjecia.jpg` wykonuje minimum trzy kolejne pełne zadania HTTP na zdjęciu z tłem, używając prawdziwych modeli. Sprawdza podgląd, działanie obu modeli, pobranie PNG 1600 × 1200 oraz dostępność API po każdym zdjęciu; usuwa zadania testowe. Możesz podać kilka ścieżek, aby porównać różne zdjęcia. Ten test obejmuje połączenie modeli, którego nie sprawdzały wcześniejsze próby osobnych modeli ani przezroczyste fixture PNG. Testy jednostkowe celowo kończą proces pomocniczy sygnałem SIGSEGV i sprawdzają jego odtworzenie oraz limit czasu.

## Co jeszcze wymaga materiałów lub konfiguracji

- Źródłowe zdjęcie prelegenta w dobrej rozdzielczości. Wybrany gradient jest już zapisany w repozytorium razem z oryginałem; [opis przygotowania tła](reference_assets/gradient-selection.md).
- Wyniki na kilku źródłowych portretach do oceny maski, linii brody i filtrów. Geometria 4:3 została zatwierdzona 9 października 2026; przykład 16:9 nie zmienia formatu.
- Kalibracja lokalnych filtrów z wynikiem Canva dla identycznego zdjęcia i suwaków.
- Opcjonalnie, poza planem samodzielnych testów: własna konfiguracja OAuth i szablon Canva, a następnie rzeczywista próba utworzenia oraz edycji projektu. Same testy z kontrolowanym API nie potwierdzają działania na koncie.
- Dalsze szczegóły stylu i oficjalne pliki marki, jeśli zamiennik Barlow Condensed ma zostać zastąpiony Champions Gothic.

Kod i konfiguracja Codespaces są częścią repozytorium. Aby rozpocząć testy, uruchom własną sesję według instrukcji powyżej. Osobny, stale działający serwer nie został skonfigurowany. Zapisany szkic środowiska Codex jest niezależny od Codespaces i wymaga zapisania ustawień oraz publikacji w interfejsie Codex, jeśli chcesz korzystać z tego środowiska.

Plan dalszych prac: [uruchomienie pod URL do testów](docs/TEST-DEPLOYMENT.md) oraz [specyfikacja frontendu](docs/FRONTEND.md).
