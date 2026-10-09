# Frontend narzędzia do zdjęć prelegentów

Jeden ekran służy do wgrania jednej osoby, sprawdzenia wyciętej sylwetki, pomiaru głowy i pobrania PNG 1600 × 1200. Nazwisko służy do nazwania pliku. Canva pozostaje opcjonalna i jej kontrolki są ukryte bez konfiguracji.

## Wdrożona iteracja kadrowania

| Obszar        | Działanie                                                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Tło i zdjęcie | Podgląd stałego kwadratu gradientu na białym płótnie, nazwisko, wybór zdjęcia i trybu usuwania tła                            |
| Kadrowanie    | Wysokość głowy 30–45%, aktualizacja i reset; pozycja czubka, prawego skraju i dołu jest stała                                 |
| Pomiar głowy  | Wycięta sylwetka z liniami włosów i brody, korekta obu linii i przycisk zastosowania pomiaru                                  |
| Filtry        | Cały wcześniejszy preset; opcjonalne delikatne odszumianie domyślnie wyłączone; zastosowanie i przywrócenie presetu           |
| Podgląd       | Białe płótno z kwadratem i osobą, opcjonalne prowadnice, rzeczywisty udział głowy, ostrzeżenia oraz potwierdzenie poprawności |
| Wynik         | PNG bez prowadnic, usunięcie zdjęcia z serwera                                                                                |

Swobodne przesuwanie i zoom zostały zastąpione pomiarem głowy i wyborem jej udziału. Dzięki temu korekta nie zmienia zatwierdzonych kotwic. Zmiana ustawień blokuje pobranie do aktualizacji podglądu. Błąd pomiaru zachowuje ostatni prawidłowy wynik, ale interfejs prosi o poprawę nowych ustawień przed pobraniem.

Automat ustala jedynie wstępny pomiar głowy. Przy braku wykrytej twarzy po potwierdzeniu jednej osoby wymagane jest ręczne ustawienie brody. Przy zbyt ciasnym lub szerokim źródle pojawia się konkretne wyjaśnienie i prośba o inne zdjęcie. Żaden komunikat nie sugeruje, że aplikacja dorobiła brakującą część osoby.

Kontrolki mają etykiety i obsługę klawiatury; prowadnice nie wymagają przeciągania. Na telefonie podgląd i status są nad ustawieniami. Wszelkie zdjęcia i wyniki przechowywane są w pamięci maksymalnie 20 minut; restart usuwa zadania.

[Zatwierdzona geometria i plan kalibracji](ITERACJA-KADROWANIA.md) opisują pomiary oraz ograniczenia automatu.

## Następne usprawnienia

Najpierw porównać wyniki na rzeczywistych zdjęciach o różnych pozach, dopracować wiarygodność pomiaru głowy i ocenić filtry. Potem uprościć pracę z pomiarem, np. dodać możliwość wskazania brody na zdjęciu przy zachowaniu suwaków dla klawiatury. Osobno można dodać przeciąganie pliku, licznik sesji, przycisk nowego zdjęcia oraz docelowe logo, font i styl kontrolek.
