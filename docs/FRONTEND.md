# Frontend narzędzia do zdjęć prelegentów

**Cel:** użytkownik wgrywa jedno zdjęcie, sprawdza automatycznie przygotowaną sylwetkę na wybranym czerwonym gradiencie, poprawia kadr i pobiera PNG 1600 × 1200. Nazwa prelegenta służy do nazwania pliku; obecnie nie jest tekstem naniesionym na grafikę.

Roboczy frontend już obsługuje upload, podgląd, suwaki kadru, filtry, ostrzeżenia i eksport. Poniższy opis to propozycja kolejnej iteracji, a nie lista funkcji już wdrożonych. Pierwszy test pod URL może korzystać z obecnego interfejsu.

Domyślny przebieg jest samodzielny, bez Canva. Jej przyciski i statusy pojawiają się wyłącznie po świadomym skonfigurowaniu integracji; nie ma etapu „oczekiwania na Canva”.

**Jeden ekran roboczy**

Na komputerze: nagłówek, lewy panel ustawień o szerokości około 340–360 px i duży podgląd po prawej. Pod podglądem status, ostrzeżenia i eksport. Na telefonie przed wyborem pliku najpierw upload; po przygotowaniu zdjęcia podgląd i kontrolki kadru. Stałe proporcje podglądu 4:3.

| Miejsce | Zawartość i działanie |
| --- | --- |
| Nagłówek | „Zdjęcia prelegentów”, oznaczenie „Wersja testowa”, format „1600 × 1200”; skrót do pomocy |
| 1. Zdjęcie | Imię i nazwisko, pole wyboru/przeciągnięcia pliku, miniatura źródła, tryb automatycznego usuwania tła lub gotowego PNG; przycisk „Przygotuj zdjęcie” |
| 2. Kadr | Powiększenie, przesunięcie w poziomie i pionie; „Aktualizuj podgląd” oraz „Resetuj kadr” |
| 3. Filtry | Domyślny preset; łatwo dostępne nasycenie i jasność; rozwijane pozostałe suwaki; „Zastosuj filtry” oraz „Przywróć preset” |
| Podgląd | Gotowy wynik na wybranym gradiencie, opcjonalne prowadnice pozycji twarzy i górnego marginesu; przełączenie na zdjęcie źródłowe |
| Wynik | „Pobierz PNG”, „Nowe zdjęcie”, „Usuń zdjęcie z serwera” |
| Ustawienia zaawansowane | Reguły kompozycji oraz opcjonalna zmiana tła; domyślnie zwinięte |

**Przebieg pracy i komunikaty**

1. **Start:** wybrany gradient jest już gotowy. Podgląd pokazuje samo tło z tekstem „Dodaj zdjęcie prelegenta”. Użytkownik nie musi wgrywać gradientu ponownie.
2. **Plik wybrany:** widoczna miniatura i nazwa pliku; przycisk przygotowania aktywny po wpisaniu nazwiska. Obok krótka informacja: „JPEG, PNG lub WebP, do 20 MB, minimum 300 px na krótszym boku”.
3. **Przetwarzanie:** widoczne kolejne etapy „Sprawdzanie zdjęcia”, „Usuwanie tła”, „Przygotowywanie kadru”. Nie pokazywać wymyślonych procentów ani czasu zakończenia. Na czas pracy zablokować operacje kolidujące z bieżącym zadaniem.
4. **Kontrola zdjęcia:** przy kilku osobach komunikat „Wybierz zdjęcie z jedną osobą” i powrót do wyboru pliku. Przy niepewnej detekcji pokazać źródło, ostrzeżenie oraz świadome potwierdzenie „Na zdjęciu jest jedna osoba”.
5. **Korekta:** użytkownik ogląda włosy, dłonie i ubranie. Zmiana suwaków oznacza „Zmiany oczekują na aktualizację”; pobranie jest zablokowane do aktualizacji podglądu. Głowa i margines są sprawdzane według reguł kompozycji, które wymagają kalibracji na zatwierdzonym przykładzie.
6. **Gotowe:** „PNG gotowy — 1600 × 1200”. Pobranie jednym kliknięciem. Informacja o pozostałym czasie sesji na podstawie czasu wygaśnięcia zadania. „Nowe zdjęcie” usuwa poprzednie zadanie i czyści formularz po potwierdzeniu, że użytkownik pobrał wynik.
7. **Błąd lub wygaśnięcie:** konkretna przyczyna i następna czynność, np. „Wybierz mniejszy plik” albo „Sesja wygasła. Wgraj zdjęcie ponownie”. Błąd Canva jest pokazany w obszarze Canva i nie zabiera możliwości pobrania lokalnego PNG.

**Filtry i tło**

Domyślny preset: temperatura 13, odcień 0, jasność −8, kontrast −12, światła 3, cienie 6, biel −15, czerń 0, jaskrawość 15, nasycenie −63, ostrość 20, przejrzystość 0, winieta 0; odwrócenie kolorów wyłączone. Filtry działają tylko na sylwetce.

Zaawansowane suwaki można pogrupować jako „Kolor”, „Światło” i „Tekstura”. Preset ma być łatwy do przywrócenia, a zmiana wartości widoczna przy suwaku. Lokalny algorytm wymaga porównania z wynikiem Canva dla tego samego zdjęcia; nie oznaczać go jako identycznego z Canva przed kalibracją.

Tło jest domyślnie wybrane i ma zachować swoje kolory. Opcjonalny import tła pozostaje w ustawieniach zaawansowanych. Obecne API stosuje zmianę tła do kolejnych zdjęć; przy już przygotowanym wyniku interfejs musi wyraźnie poprosić o ponowne przygotowanie zdjęcia, jeśli użytkownik chce użyć nowego tła.

**Opcjonalny obszar Canva**

Ten obszar jest poza planem samodzielnej wersji. Nie pokazujemy go bez konfiguracji integracji.

| Stan | Widoczny tekst lub działanie |
| --- | --- |
| Brak konfiguracji | Cały obszar ukryty; dostępne pobieranie samodzielnego PNG |
| Skonfigurowana, konto niepołączone | „Połącz z Canva” |
| Konto połączone i zdjęcie gotowe | „Utwórz projekt Canva” |
| Operacja w toku | Osobne statusy tworzenia projektu i eksportu |
| Sukces | „Otwórz projekt Canva” i jednoznaczne oznaczenie, że pobierany plik pochodzi z Canva |
| Błąd eksportu | Zachowany link do projektu, możliwość ponowienia eksportu i dostęp do lokalnego wyniku |

Adres edytora pokazywać dopiero po rzeczywistym utworzeniu projektu. „Połącz z Canva” nie może być przedstawione jako logowanie do samego narzędzia.

**Co już jest, a co trzeba dopisać**

| Zakres | Stan |
| --- | --- |
| Domyślny gradient, upload, lokalne usuwanie tła, podgląd i PNG | Działa w wersji roboczej |
| Suwaki kadru, reset, filtry i reguły kompozycji | Działa; docelowe wartości kompozycji wymagają zatwierdzenia |
| Ostrzeżenia, kontrola jednej osoby, ręczne usuwanie zadania | Działa |
| Integracja Canva | Opcjonalna, poza planem testów; kod zachowany, kontrolki ukryte bez konfiguracji |
| Uproszczenie układu, drag-and-drop pliku, prowadnice, licznik sesji, przycisk nowego zdjęcia | Do wykonania w kolejnej iteracji frontendu |
| Logowanie testerów | Do skonfigurowania na bramce dostępu przed udostępnieniem URL |
| Docelowy styl wizualny | Do ustalenia: logo, font, kolory kontrolek i wygląd przycisków |

**Kolejność realizacji**

Najpierw uruchomić obecną wersję w GitHub Codespaces i zebrać wyniki na kilku zdjęciach; [instrukcja pierwszego uruchomienia](PIERWSZE-URUCHOMIENIE.html). Następnie uprościć układ, przenieść zmianę tła do ustawień zaawansowanych i dopracować stany błędów oraz wygaśnięcia. Potem skalibrować kadr/filtry, dodać prowadnice i styl wizualny. Canva nie jest wymaganym etapem tej realizacji. Stały serwer będzie kolejną możliwością po prywatnych testach.

Kontrolki powinny działać klawiaturą, mieć widoczne etykiety i fokus. Statusy i błędy powinny być czytelne także bez rozróżniania kolorów. Styl interfejsu pozostaje neutralny do czasu wskazania elementów identyfikacji wizualnej; dostarczony gradient jest tłem wynikowej grafiki.
