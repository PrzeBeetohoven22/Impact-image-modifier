# Kadrowanie — 9 października 2026

PNG ma 1600 × 1200, białe tło i pełny oryginalny kwadrat gradientu 1080 × 1080 w punkcie (0, 120). Gradient pozostaje bez zmian. Prawy skraj widocznego wycięcia jest kotwiczony na x = 1224; sylwetka jest dopasowana do dolnej krawędzi y = 1200.

W tej iteracji użytkownik zastąpił stały poziom głowy dwoma swobodniejszymi suwakami:

- **WIELKOŚĆ SYLWETKI** zmienia skalę proporcjonalnie. Parametr wewnętrzny 15–75, start 45, określa wysokość głowy względem bazowych 960 px. Liczby i procenty są ukryte w UI. Suwak nie deformuje osoby.
- **WYSOKOŚĆ SYLWETKI** przesuwa czubek od y = 174 do y = 660. To od 5% do 50% wysokości kwadratu poniżej jego górnej krawędzi. Wyższa wartość podnosi sylwetkę. Reset wraca do y = 240 i wielkości 45.

Krótki kadr źródłowy jest powiększany do kontaktu z dołem; nie obowiązuje dawne odrzucanie przy głowie większej niż 65%. Przy bardzo dużym powiększeniu i niskim ustawieniu ograniczamy skalę tak, aby głowa mieściła się w dostępnym kadrze. Szerokie wycięcia są przycinane po lewej stronie. Nie dorabiamy tułowia ani nie zmieniamy rysów. Można przetwarzać wejścia pionowe, kwadratowe, poziome i długie zdjęcia całej postaci; pozostają limity pliku i jakości opisane w instrukcji.

Widoczny fragment jest wycinany w źródle przed powiększeniem. Dzięki temu bardzo szerokie lub wysokie zdjęcie nie wymaga tworzenia ogromnej bitmapy, która później byłaby odrzucona. Gdy zakotwiczenie szerokiego wycięcia ukryłoby twarz, okno źródłowe jest kadrowane wokół niej. Skalowanie pozostaje proporcjonalne, z zaokrągleniem do pikseli. Prawy skraj jest wyznaczany po pionowym kadrowaniu, więc obiekt lub łokieć pod kadrem nie przesuwa portretu.

Usuwanie tła nakłada wyłącznie alfa modelu na źródłowe RGB. Cały wcześniejszy preset filtrów, w tym nasycenie −63, pozostaje bez zmian. Dodatkowe łagodne odszumianie domyślnie jest wyłączone. Nie używamy generowania ani retuszu osoby.

Detektor twarzy i maska dają szacunkowy pomiar włosów oraz brody. Bez twarzy używamy przybliżenia z wysokości wycięcia; można poprawić linie w rozwijanej sekcji. Przy uniesionych rękach lub przedmiotach nad głową automat może wymagać korekty pomiaru. Mikrofon lub laptop pozostawiony w masce może wpływać na granice wycięcia — lokalna detekcja go sygnalizuje, ale ta iteracja nie usuwa go ze zdjęcia.

Ostrzeżenia o jakości nie blokują PNG. Błędny pomiar poza zdjęciem jest odrzucany; poprzedni wynik pozostaje dostępny, a nowe ustawienia trzeba poprawić przed pobraniem. Testy obejmują poziomy 174/240/660, wielkość 75, bardzo szerokie i wysokie źródła, ciasne kadry, zachowanie RGB/alfa, niezmienne tło oraz prawdziwe pobranie pliku w Chromium. Syntetyczne maski nie potwierdzają jakości włosów ani dokładności brody na rzeczywistych zdjęciach.
