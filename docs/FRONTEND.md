# Frontend narzędzia do zdjęć prelegentów

Jeden ekran służy do wgrania jednej osoby, sprawdzenia wyciętej sylwetki, pomiaru głowy i pobrania PNG 1600 × 1200. Każdy plik ma stałą nazwę `Impact'27 photo.png`; formularz nie zbiera nazwiska. Canva pozostaje opcjonalna i jej kontrolki są ukryte bez konfiguracji.

## Wdrożona iteracja kadrowania

| Obszar        | Działanie                                                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Tło i zdjęcie | Podgląd stałego kwadratu gradientu na białym płótnie, wybór zdjęcia z automatycznym rozpoznaniem przezroczystej sylwetki      |
| Kadrowanie    | Wysokość głowy 30–55%, domyślnie 45%, aktualizacja i reset; pozycja czubka, prawego skraju i dołu jest stała                  |
| Pomiar głowy  | Wycięta sylwetka z liniami włosów i brody, korekta obu linii i przycisk zastosowania pomiaru                                  |
| Filtry        | Cały wcześniejszy preset; opcjonalne delikatne odszumianie domyślnie wyłączone; zastosowanie i przywrócenie presetu           |
| Podgląd       | Białe płótno z kwadratem i osobą, opcjonalne prowadnice, rzeczywisty udział głowy, ostrzeżenia oraz potwierdzenie poprawności |
| Wynik         | PNG bez prowadnic, usunięcie zdjęcia z serwera                                                                                |

Swobodne przesuwanie i zoom zostały zastąpione pomiarem głowy i wyborem jej udziału. Dzięki temu korekta nie zmienia zatwierdzonych kotwic. Zmiana ustawień blokuje pobranie do aktualizacji podglądu. Błąd pomiaru zachowuje ostatni prawidłowy wynik, ale interfejs prosi o poprawę nowych ustawień przed pobraniem.

Automat ustala jedynie wstępny pomiar głowy. Przy braku wykrytej twarzy po potwierdzeniu jednej osoby wymagane jest ręczne ustawienie brody. Ciasny kadr może wyjątkowo dać do 65% głowy, z ostrzeżeniem i świadomym potwierdzeniem. Przy jeszcze ciaśniejszym lub zbyt szerokim źródle pojawia się konkretne wyjaśnienie i prośba o inne zdjęcie. Żaden komunikat nie sugeruje, że aplikacja dorobiła brakującą część osoby.

Kontrolki mają etykiety i obsługę klawiatury; prowadnice nie wymagają przeciągania. Na telefonie podgląd i status są nad ustawieniami. Wszelkie zdjęcia i wyniki przechowywane są w pamięci maksymalnie 20 minut; restart usuwa zadania.

[Zatwierdzona geometria i plan kalibracji](ITERACJA-KADROWANIA.md) opisują pomiary oraz ograniczenia automatu.

## Następne usprawnienia

Najpierw porównać wyniki na rzeczywistych zdjęciach o różnych pozach, dopracować wiarygodność pomiaru głowy i ocenić filtry. Potem uprościć pracę z pomiarem, np. dodać możliwość wskazania brody na zdjęciu przy zachowaniu suwaków dla klawiatury. Osobno można dodać przeciąganie pliku, licznik sesji, przycisk nowego zdjęcia oraz docelowe logo, font i styl kontrolek.

## KV Impact'27

Wygląd opiera się na dostarczonym screenie: gradientowy nagłówek, białe sekcje, czerwone panele dla generowania i pobierania oraz przyciski z białą obwódką. Tekst używa Raleway Light; H1, nagłówki sekcji i przyciski korzystają z wąskiego Barlow Condensed Bold jako zamiennika Champions Gothic. Fonty są dołączone lokalnie i mają licencje OFL.

[Podgląd na komputerze](INTERFEJS-IMPACT27.png) · [Podgląd na telefonie](INTERFEJS-IMPACT27-MOBILE.png). Zrzuty pokazują ekran przed wybraniem zdjęcia, więc przyciski generowania i pobierania są nieaktywne.

Sekcja 1 nosi nazwę **Przygotowanie zdjęcia na Impact'27**. Miniatura tła ma połowę poprzedniej szerokości i wysokości. Pole wyboru pliku ma etykietę **DODAJ ZDJĘCIE NA IMPACT'27** oraz większy przycisk. Formularz zawiera wymagania zdjęcia i CTA **GENERUJ GRAFIKĘ NA IMPACT'27**. Usunięto nazwisko i menu trybu przygotowania sylwetki. Zmiany stylu dotyczą narzędzia; grafika wynikowa zachowuje zatwierdzone tło i geometrię.
