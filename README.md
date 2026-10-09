# Impact image modifier

Działająca aplikacja robocza do przygotowania zdjęcia jednego prelegenta: walidacja → wykrycie osób i twarzy → lokalne usunięcie tła → filtry sylwetki → korekta kadru → PNG **1600 × 1200, sRGB, bez przezroczystości**. Opcjonalna integracja Canva Connect tworzy projekt z szablonu marki i pobiera zweryfikowany eksport. Wygląd interfejsu jest neutralny i przeznaczony do późniejszego stylowania przez użytkownika.

Domyślna wersja do testów działa samodzielnie, bez konta, szablonu i kluczy Canva. Aplikacja sama łączy sylwetkę z wybranym gradientem i zapisuje wynik. Przy braku konfiguracji Canva interfejs nie pokazuje jej kontrolek ani komunikatów o oczekującej integracji.

Najprostsza ścieżka pierwszych testów w przeglądarce: **GitHub Codespaces**, bez osobnego hostingu. [Instrukcja krok po kroku](docs/PIERWSZE-URUCHOMIENIE.html) obejmuje pobranie paczki, upload kodu i otwarcie prywatnego podglądu. Konfiguracja `.devcontainer` wybiera Node 24, instaluje zależności i buduje aplikację. Następnie w terminalu Codespaces uruchom `bash .devcontainer/start.sh` i otwórz port 3001 z panelu Ports. URL działa podczas uruchomionej sesji; Codespaces ma limity użycia zależne od konta. Faktyczne utworzenie sesji na koncie GitHub nie zostało wykonane w tej instancji.

**Jeśli kod jest już na GitHub, możesz od razu uruchomić testy:**

1. Na stronie repozytorium kliknij **Code → Codespaces → Create codespace on main**.
2. Poczekaj na instalację, otwórz **Terminal → New Terminal** i wpisz `bash .devcontainer/start.sh`.
3. W panelu **Ports** otwórz port **3001** przez **Open in Browser**. Pozostaw dostęp **Private**.
4. Wybierz zdjęcie prelegenta, kliknij **Przygotuj zdjęcie**, sprawdź kadr i kliknij **Pobierz PNG**.
5. Po zakończeniu wejdź na [github.com/codespaces](https://github.com/codespaces) i wybierz **… → Stop codespace** przy tej sesji.

[Instrukcja PDF](docs/PIERWSZE-URUCHOMIENIE.pdf) zawiera szczegółowe kroki i pomoc. Gdy repozytorium zawiera już pliki aplikacji, pomiń w niej kroki 1–2 i zacznij od **kroku 3: Utwórz środowisko Codespaces**. Kopię kodu pobierzesz z GitHub przez **Code → Download ZIP**.

## Uruchomienie

W katalogu tego repozytorium użyj Node **24** i npm **11**:

```sh
npm_config_onnxruntime_node_install_cuda=skip npm ci --cache /workspace/.npm-cache
npm run check:models
npm run dev
```

Development: Vite na porcie 5173, API na 3001. `npm run build && npm start` obsługuje również gotowy interfejs z serwera na porcie 3001. Domyślnie serwery nasłuchują tylko na interfejsie loopback. Podczas wdrożenia ustaw `HOST`, właściwy `APP_ORIGIN` i HTTPS. Narzędzie nie ma zewnętrznej kontroli dostępu: dla hostowania poza lokalnym developmentem wymagany jest wewnętrzny reverse proxy/SSO, ograniczenia zasobów i HTTPS.

Flaga instalacji pomija opcjonalne biblioteki CUDA: pipeline używa CPU oraz WASM, nie wymaga GPU. Wagi modeli są częścią paczek npm i nie trzeba pobierać zdjęć ani modeli z zewnętrznych serwisów podczas przetwarzania. Instalacja zachowuje TLS i sprawdzanie integralności lockfile.

Cloud task jest już izolowany. Używaj istniejącego checkoutu; nie twórz worktree bez wyraźnego polecenia użytkownika. Procesy nie są częścią snapshotu i trzeba je uruchamiać ponownie.

## Pierwsze zdjęcie

1. Wybrany gradient jest już domyślnie wczytany: `assets/impact-gradient-1600x1200.png`. Nie musisz wgrywać tła; od razu wybierz zdjęcie prelegenta. Opcjonalnie wgraj inne zatwierdzone, nieprzezroczyste tło **1600 × 1200**. W trybie „Gotowe tło” aplikacja nie zmienia jego kadru. Dla wybranego czerwonego wycinka wybierz „Wycinek gradientu — pomiń czarne marginesy”: usuniemy zewnętrzne czarne obszary, zachowamy proporcje i wypełnimy płótno 4:3, symetrycznie przycinając nadmiar. Nie rozciągamy ani nie filtrujemy gradientu. Sprawdź podgląd tła po imporcie. W szablonie Canva użyj takiego samego tła docelowego.
2. Podaj nazwę prelegenta i wybierz JPEG, PNG lub WebP do 20 MB, do 40 megapikseli, minimum 300 px na krótszym boku. Wybierz automatyczne usunięcie tła albo istniejący PNG z wyciętą sylwetką.
3. Jeśli wykryto kilka osób, przygotuj inne zdjęcie z jedną osobą. Przy niepewnej detekcji sprawdź źródło i potwierdź ręcznie. Model nie jest nieomylny; nie pomijaj kontroli zdjęcia.
4. Sprawdź włosy, ubranie i dłonie. Zmień zoom, pozycję poziomą/pionową, kliknij **Aktualizuj podgląd**. Możesz zmienić filtry i reguły kompozycji lub zresetować kadr.
5. Zaakceptuj ostrzeżenia po sprawdzeniu zdjęcia i pobierz gotowy PNG. To kończy podstawowy przebieg pracy.
6. Tylko jeśli w przyszłości potrzebna będzie integracja Canva: po jej skonfigurowaniu pojawią się kontrolki połączenia OAuth i utworzenia projektu. [Instrukcja Canva](docs/CANVA.md) opisuje szablon, zakresy, uprawnienia i próbę na koncie.

Po udanej segmentacji źródło jest zwalniane z pamięci. Sylwetka, tło i wynik pozostają tylko w sesji procesu przez maksymalnie 20 minut; możesz usunąć je wcześniej przyciskiem. Nie zapisujemy zdjęć na dysku. Cookie sesji jest podpisane, HttpOnly i SameSite. Połączenie Canva świadomie zapisuje asset i design na zdalnym koncie; ich retencja podlega Canva i nie jest objęta lokalnym usuwaniem.

## Architektura i konfiguracja

- `src/client/`: React / TypeScript / Vite, struktura interfejsu i kontrolki; brak nowych elementów brandingu.
- `src/server/app.ts`: API, prywatne sesje, ograniczona kolejka operacji, statusy i retencja.
- `src/server/providers.ts`: wymienne `BackgroundRemovalProvider` i `SubjectAnalysisProvider`. Usuwanie tła: **IMG.LY background-removal-node / ISNet, ONNX CPU**; detekcja: **Human / BlazeFace + CenterNet, WASM**. Wyłączono opisy, rozpoznawanie tożsamości, analizę emocji i wszystkie zbędne modele. Nie używamy LLM ani generatora obrazów.
- `src/server/images.ts`: walidacja typu na podstawie rzeczywistego dekodowania, EXIF, granice alfa, geometria kadru, filtry i eksport.
- `src/server/canva.ts`: serwerowe OAuth z PKCE, upload osobnej warstwy PNG, stabilne Autofill z brand template i asynchroniczny export; brak browser automation.
- `src/shared/config.ts`: płótno, kompozycja, wartości suwaków oraz walidacja konfiguracji. Domyślne pozycje są robocze; można je zmienić w interfejsie.

Preset zachowuje wartości dostarczonych suwaków: temperatura 13, odcień 0, jasność −8, kontrast −12, światła 3, cienie 6, biel −15, czerń 0, jaskrawość 15, nasycenie −63, odwrócenie wyłączone, ostrość 20, przejrzystość 0, winieta 0. Lokalny renderer ma własną, deterministyczną mapę tych wartości — **nie jest skalibrowany do algorytmu Canva**. Nie dodano nieznanych wartości edycji poszczególnych kolorów. Filtry nie modyfikują tła. Przeskalowanie i wycięcie nie regenerują twarzy; należy sprawdzić jakość maski na docelowych zdjęciach.

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

## Co jeszcze wymaga materiałów lub konfiguracji

- Źródłowe zdjęcie prelegenta w dobrej rozdzielczości. Wybrany gradient jest już zapisany w repozytorium razem z oryginałem; [opis przygotowania tła](reference_assets/gradient-selection.md).
- Zatwierdzony przykład docelowy 1600 × 1200 do porównania ustawienia głowy i skali. Przykład 16:9 nie zmienia wymaganego formatu.
- Kalibracja lokalnych filtrów z wynikiem Canva dla identycznego zdjęcia i suwaków.
- Opcjonalnie, poza planem samodzielnych testów: własna konfiguracja OAuth i szablon Canva, a następnie rzeczywista próba utworzenia oraz edycji projektu. Same testy z kontrolowanym API nie potwierdzają działania na koncie.
- Docelowy wygląd frontendowy, który projektuje użytkownik.

Kod jest przygotowany lokalnie w checkoutcie. Nie został automatycznie wysłany na GitHub ani wdrożony. Zapisany szkic konfiguracji środowiska wymaga przeglądu, zapisania ustawień i publikacji w interfejsie środowiska.

Plan dalszych prac: [uruchomienie pod URL do testów](docs/TEST-DEPLOYMENT.md) oraz [specyfikacja frontendu](docs/FRONTEND.md).
