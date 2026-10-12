# Uruchomienie pod adresem do testów

Przed produkcyjnym udostępnieniem wykorzystaj [README produkcji — prywatność i wdrożenie](README-PRODUKCJA.md): opisuje faktyczny przepływ danych, retencję, brakujące decyzje administratora i warunki przyjęcia wdrożenia. Propozycje hostingu w tym dokumencie pozostają propozycjami.

Kod aplikacji, konfiguracja Codespaces i instrukcje są częścią repozytorium. Osobny, stale działający serwer nie został jeszcze wdrożony. Zapisanie i publikacja konfiguracji środowiska Codex nie tworzą adresu WWW aplikacji.

Do pierwszych prywatnych testów bez osobnego hostingu użyj [instrukcji GitHub Codespaces](PIERWSZE-URUCHOMIENIE.html). Dalsza część tego dokumentu opisuje osobne wdrożenie na serwerze, gdy będzie potrzebny stale dostępny URL.

**Proponowana ścieżka:** jedna usługa Node.js na Render, pod adresem HTTPS przydzielonym przez hosting. Wersja do testów jest samodzielna: aplikacja łączy sylwetkę z gradientem i eksportuje PNG, bez konta ani szablonów Canva. Nie potrzebujesz własnej domeny. Hosting i jego plan trzeba dopiero wybrać; żaden nie został zamówiony.

**Co pozostało, po kolei**

1. **Użyć gałęzi z aktualnym kodem w repozytorium GitHub** `PrzeBeetohoven22/Impact-image-modifier`. Jeśli ostatnie zmiany są tylko lokalne, najpierw je zapisać i wysłać. Repozytorium powinno zawierać kod, lockfile oraz katalogi `assets/` i `reference_assets/`. Plik `.env`, sekrety, zdjęcia testowe, `node_modules/` i `dist/` nie powinny być wysyłane. Hosting musi dostać dostęp do repozytorium, jeśli jest prywatne.
2. **Utworzyć usługę Web Service z tego repozytorium.** Wybrać gałąź, na którą rzeczywiście trafił kod. Frontend i API działają razem w jednym serwerze; nie trzeba tworzyć osobnego hostingu dla Reacta.
3. **Ustawić instalację, uruchomienie i zmienne** zgodnie z tabelą poniżej. Wybrać jedną instancję bez automatycznego zwiększania liczby instancji. Do testów potrzebny jest stale uruchomiony serwer Linux x64, ponieważ aplikacja przetwarza zdjęcia lokalnymi modelami i przechowuje sesje w pamięci.
4. **Ograniczyć dostęp do testerów** przez bramkę logowania hostingu albo reverse proxy z hasłem/SSO. Aplikacja nie ma jeszcze logowania. Ochrona musi obejmować stronę i API; przed wdrożeniem należy wybrać i skonfigurować konkretną bramkę. Sam adres HTTPS nie ogranicza dostępu. Trzeba też potwierdzić sposób spełnienia warunków AGPL użytej biblioteki IMG.LY lub zmienić licencję/provider.
5. **Wdrożyć i ustawić faktyczny adres HTTPS w `APP_ORIGIN`.** Jeśli adres jest przydzielany dopiero podczas pierwszego wdrożenia, uzupełnić go i ponownie uruchomić usługę przed testami uploadu. Dopiero po sprawdzeniu działania przekazać testerom URL i dostęp.
6. **Wykonać próbę na kilku zdjęciach jednej osoby:** upload → usunięcie tła → korekta kadru → pobranie PNG. Sprawdzić twarz, włosy, dłonie, kolory i format 1600 × 1200. Osobno sprawdzić zbyt duży plik, zdjęcie kilku osób i usunięcie danych z sesji.

**Ustawienia dla osoby wykonującej wdrożenie**

| Ustawienie | Wartość |
| --- | --- |
| Typ usługi | Web Service z procesem Node.js, jedna instancja |
| Wersja Node | 24; projekt zawiera `.nvmrc` i `engines` |
| Instalacja i build | `npm_config_onnxruntime_node_install_cuda=skip npm ci --include=dev && npm run setup:objects && npm run build` |
| Start | `npm start` |
| `HOST` | `0.0.0.0` |
| `PORT` | Port przekazany przez hosting; aplikacja odczytuje tę zmienną |
| `APP_ORIGIN` | Faktyczny origin, np. `https://<przydzielony-host>`, bez końcowego `/` |
| Zmienne Canva | Nie są wymagane; pozostawić nieuzupełnione |
| Automatyczna kontrola dostępności | Ścieżka `/`; obecny `/api/health` tworzy sesję, więc nie używać go do częstych prób hostingu |
| Zasoby | Punkt startowy zgodny z Codespaces: 2 vCPU / 8 GB RAM; potwierdzić obciążeniem na docelowych zdjęciach |

Instalacja wymaga dostępu do rejestru npm. Modele po instalacji są lokalne; przetwarzanie zdjęć nie wymaga GPU ani zewnętrznego API. Nie pomijać zależności developerskich przed buildem, ponieważ zawierają TypeScript i Vite. Serwer potrzebuje również plików modeli z `node_modules` oraz gradientu z `assets/`; sam katalog `dist/` nie wystarczy.

Adres w tabeli jest przykładem składni, nie działającym URL. Usługa ma serwować UI i API pod tym samym adresem HTTPS. Bramkę dostępu należy sprawdzić także dla pobierania PNG. Kontrola dostępności hostingu może wymagać osobnego, ograniczonego wyjątku w bramce; nie wolno w tym celu udostępnić całego API.

**Co oznacza to dla testów**

Zadania wygasają po 20 minutach od utworzenia; wygasłe wpisy są usuwane z pamięci sesji co 30 sekund. Rozpoczęta operacja modelu może jeszcze potrwać do jej zakończenia lub timeoutu. Restart, nowe wdrożenie lub zatrzymanie usługi usuwa bieżące zadania i lokalne połączenie sesji z Canva; nie usuwa zdalnych plików Canva. Do pierwszego testu nie potrzeba bazy danych, ale wynik trzeba pobrać przed wygaśnięciem zadania. Rozbudowanie narzędzia o historię albo wiele instancji wymaga zaprojektowania przechowywania i routingu sesji. Szczegóły retencji przeglądarki i infrastruktury opisuje README produkcji.

Lokalne testy nie zastępują próby na hostingu: po wdrożeniu trzeba sprawdzić HTTPS, cookie sesji, upload, modele, pamięć i pobieranie pliku. Wartości filtrów pochodzą z dostarczonych suwaków; zgodność wyglądu z Canva i docelowe ustawienie głowy nadal wymagają zatwierdzonego przykładu.

**Wcześniejszy szkic środowiska Codex**

Nie uzupełniaj kluczy Canva. We wcześniejszym szkicu zapisano wymaganie `CANVA_BASIC_AUTH` oraz propozycje zmiennych `CANVA_CLIENT_ID`, `CANVA_REDIRECT_URI`, `CANVA_BRAND_TEMPLATE_ID` i `CANVA_IMAGE_FIELD`. Usuń te niepotrzebne wymagania w ustawieniach środowiska. Narzędzie zapisu szkicu umożliwia dodawanie wymagań; usuwanie odbywa się w edytorze ustawień. Instrukcje uruchomienia nie wymagają już Canva. Zapis ustawień i publikacja środowiska Codex pozostają odrębne od wdrożenia strony pod URL.

**Canva — opcjonalnie, poza planem testów**

Jeżeli w przyszłości będzie potrzebny edytowalny projekt Canva, można przygotować własną integrację i Brand Template z polem obrazu `SPEAKER`, wprowadzić sekrety wyłącznie do ustawień serwera i zarejestrować callback `https://<przydzielony-host>/api/canva/callback`. Trzeba wtedy potwierdzić uprawnienia Enterprise lub aktywny trial Autofill i wykonać prawdziwą próbę utworzenia projektu. Ten etap nie jest wymagany do działania narzędzia ani testów PNG. Szczegóły: [Konfiguracja Canva](CANVA.md).

**Podział pracy**

| Osoba | Do wykonania |
| --- | --- |
| Właściciel | Wybór konta i planu hostingu, dostęp do repozytorium, lista testerów i przykładowe zdjęcia |
| Osoba wdrażająca | Commit i push po autoryzacji, konfiguracja usługi i bramki dostępu, zmienne, wdrożenie oraz próba pod HTTPS |
| Wspólnie | Zatwierdzenie kadru i filtrów oraz zebranie uwag do frontendu |

Specyfikacja interfejsu do kolejnej iteracji: [Frontend narzędzia](FRONTEND.md).
