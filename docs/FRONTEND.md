# Interfejs Impact'27

Na desktopie wybór pliku, generowanie, dwa suwaki, cały podgląd i pobieranie są widoczne na pierwszym ekranie przy 1280 × 720 oraz 1366 × 768. Nagłówek jest kompaktowy, podgląd dopasowuje rozmiar do wysokości okna, a dodatkowe ustawienia przewijają się w lewej kolumnie. Pobieranie znajduje się nad podglądem. Na telefonie kolejność to: wybór zdjęcia, podgląd, kadrowanie, opcje dodatkowe.

[Podgląd na komputerze](INTERFEJS-IMPACT27.png) · [Podgląd na telefonie](INTERFEJS-IMPACT27-MOBILE.png). Przyciski generowania i pobierania są nieaktywne przed wybraniem zdjęcia.

| Element                            | Zachowanie                                                                                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Przygotowanie zdjęcia na Impact'27 | Większy wybór pliku, pod nim miniatura tła i wymagania. Bez nazwiska, dodatkowego napisu „DODAJ ZDJĘCIE”, menu trybu i opisu gotowego gradientu.                                      |
| GENERUJ GRAFIKĘ NA IMPACT'27       | Automatyczne usuwanie tła lub rozpoznanie gotowej przezroczystej sylwetki.                                                                                                            |
| WIELKOŚĆ SYLWETKI                  | Proporcjonalne powiększenie. Wewnętrzny zakres 15–75, start 45; UI nie pokazuje procentów.                                                                                            |
| WYSOKOŚĆ SYLWETKI                  | Czubek od y = 174 do y = 660, czyli 5–50% wysokości gradientu pod jego górną krawędzią. Wyższa wartość suwaka podnosi osobę.                                                          |
| Kadrowanie                         | Automatyczna aktualizacja po zatrzymaniu suwaka, reset obu suwaków. Krótkie źródło jest dopasowane do dołu; powiększenie nie ucina całej głowy. Szeroki kadr można przycinać z lewej. |
| Pomiar głowy i filtry              | Dodatkowe, zwinięte sekcje. Brak wykrytej twarzy uruchamia szacunkowe kadrowanie.                                                                                                     |
| POBIERZ PNG                        | Pobieranie przez odpowiedź binarną i plik Blob. Stała nazwa `Impact'27 photo.png`, 1600 × 1200.                                                                                       |
| Uwagi do zdjęcia                   | Rozwijane, informacyjne. Usunięto obowiązkową ocenę sylwetki i checkbox blokujący eksport.                                                                                            |
| Dodatkowy obiekt                   | Komunikat przy podglądzie, zgoda lub odmowa zapisywana tylko dla tego zdjęcia. Bez retuszu i wysyłania fotografii. Pobranie pozostaje dostępne.                                       |
| Prowadnice                         | Przycisk z `aria-pressed`; linie nie trafiają do PNG.                                                                                                                                 |

Suwaki mają etykiety i obsługę klawiatury. Aktualizacja podglądu blokuje pobranie tylko do zakończenia operacji. Błędny pomiar pozostawia ostatni prawidłowy podgląd, pokazuje błąd i nie jest powtarzany w pętli. Popraw suwak lub użyj resetu. Przy kilku osobach aplikacja prosi o osobne zdjęcie; nie wybiera automatycznie osoby.

KV wykorzystuje dostarczony gradient, białe sekcje, czerwone akcenty i przyciski z obwódką. Tekst używa lokalnego Raleway Light, a nagłówki i CTA — Barlow Condensed Bold jako zamiennika Champions Gothic. Zmiany UI nie zmieniają oryginalnego gradientu w eksporcie.

[Geometria i ograniczenia](ITERACJA-KADROWANIA.md) · [Lokalne wykrywanie obiektów](OBIEKTY.md). Zdjęcia pozostają w pamięci przez maksymalnie 20 minut; restart usuwa zadania.
