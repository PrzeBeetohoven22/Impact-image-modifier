# Stały układ zdjęć prelegentów — 9 października 2026

Użytkownik zatwierdził poniższą geometrię dla PNG 1600 × 1200. Benchmarki 16:9 są odniesieniem do nakładania sylwetki na gradient; pozycje wynikają z doprecyzowanego opisu 4:3.

| Element                                     | Stała zasada                                                      |
| ------------------------------------------- | ----------------------------------------------------------------- |
| Płótno                                      | 1600 × 1200 px, białe, PNG sRGB bez przezroczystości              |
| Gradient                                    | Pełny oryginalny kwadrat; 1080 × 1080 px, x = 0, y = 120          |
| Lewa i dolna krawędź gradientu              | Dotykają odpowiednich krawędzi płótna                             |
| Biel nad gradientem                         | 120 px, czyli 10% wysokości                                       |
| Prawa krawędź gradientu                     | x = 1080; biel do x = 1600                                        |
| Czubek włosów                               | y = 240, czyli 20% wysokości płótna                               |
| Prawy skraj widocznej sylwetki              | x = 1224; wystaje o 144 px, czyli 9% szerokości całego płótna     |
| Dół sylwetki                                | Dotyka y = 1200                                                   |
| Wysokość widocznej sylwetki od czubka głowy | 960 px                                                            |
| Głowa, włosy–broda                          | Cel 288 px = 30% z 960; zakres 30–45%                             |
| Lewy skraj sylwetki                         | Wynika z oryginalnych proporcji zdjęcia i wybranego udziału głowy |

Efekt przestrzenny wynika z nakładania wyciętej sylwetki na kwadrat: część osoby jest na gradiencie, a jej prawy skraj na białym obszarze. Nie dodajemy cienia, zmiany oświetlenia, obrotu ani przebudowy postaci.

## Wdrożenie

1. Oryginalny gradient pozostaje bez zmian w `reference_assets/impact-gradient-original.png`. Skrypt `npx tsx scripts/build-background.ts` skaluje cały kwadrat proporcjonalnie i umieszcza go na białym płótnie. Nie obcina ani nie filtruje jego wnętrza. Gotowe tło jest dołączone w `assets/`; odbudowanie aplikacji nie wymaga uruchomienia tego skryptu.
2. Usuwanie tła nakłada wyłącznie maskę alfa modelu na oryginalne RGB zdjęcia. Dla istniejącego PNG zachowuje jego maskę. Żadna operacja nie generuje rysów, włosów, dłoni, ubrania ani brakującego fragmentu tułowia.
3. Detektor twarzy i maska dostarczają wstępny pomiar głowy. Dolna krawędź wykrytej twarzy przybliża brodę; ten pomiar jest oznaczony jako szacunkowy i wymaga oceny człowieka. Na wyciętej sylwetce można poprawić linię włosów i brody. Ta wersja wymaga portretu, w którym włosy są najwyższym punktem sylwetki; ręce lub przedmioty nad głową wymagają innego źródła. Bez wykrytej twarzy trzeba wskazać brodę, zanim powstanie PNG.
4. Jednolite skalowanie ustawia głowę na wybraną wysokość i czubek na y = 240. Dół dłuższego zdjęcia jest przycinany do płótna. Prawy skraj jest obliczany dla widocznego fragmentu maski, więc np. łokieć poniżej kadru nie przesuwa całego portretu.
5. Jeśli źródło kończy się za wcześnie, skala rośnie tylko tyle, by osoba dotykała dołu. Interfejs podaje rzeczywisty udział głowy. Gdy przekracza on 45%, źródło jest odrzucane; nie dorabiamy tułowia. Przy zbyt szerokiej sylwetce prosimy o inne źródło. Poprzedni prawidłowy podgląd pozostaje dostępny po błędzie korekty.
6. Zachowany jest cały wcześniejszy preset, w tym nasycenie −63. Opcjonalne delikatne odszumianie jest domyślnie wyłączone. Działa wyłącznie wewnątrz nieprzezroczystej maski i zachowuje jej krawędź oraz alfa. Filtry obejmują wyłącznie sylwetkę.
7. Tło i kotwice układu są zablokowane w interfejsie i API. Prowadnice głowy, kwadratu i prawego skraju są opcjonalne i nie pojawiają się w eksporcie.

## Sprawdzenie wyników i dalsza iteracja

Testy automatyczne obejmują pełny oryginalny gradient, białe marginesy, pozycje skrajów maski, udział głowy 30/35/45%, krótkie i długie źródła, szeroki fragment poza dolnym kadrem, zachowanie źródłowych RGB i alfa oraz eksport w przeglądarce. Kontrolowane sylwetki testowe nie potwierdzają jakości wycięcia rzeczywistych włosów ani dokładności detekcji brody.

Kolejny etap kalibracji to ocena wyników na kilku rzeczywistych zdjęciach: portret na wprost, pozycja siedząca, szerokie ramiona i zdjęcie z większą częścią tułowia. Dla każdego porównujemy rzeczywisty czubek włosów, brodę, maskę, 30–45% głowy oraz kontakt z dołem. Korygujemy pomiar i maskę, zachowując zatwierdzoną geometrię. Jeśli automat często myli brodę, dalszą poprawą może być detektor punktów twarzy; służyłby wyłącznie do pomiarów. Odtworzenie wyglądu Canva wymaga osobnej kalibracji filtrów na identycznym źródle; obecne wartości pozostają lokalnym przybliżeniem.
