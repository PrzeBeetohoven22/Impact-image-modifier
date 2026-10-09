# Lokalne wykrywanie dodatkowych obiektów

Ta wersja wykrywa obiekty i zapisuje zgodę lub odmowę. **Nie wykonuje retuszu AI i nie wysyła zdjęć do żadnej usługi.** Odpowiedź dotyczy tylko bieżącego zdjęcia, wygasa razem z nim i nie blokuje PNG.

Przy detekcji przy podglądzie pojawia się zamówiony komunikat:

> WYKRYTO OBIEKT NIE BĘDĄCY SYLWETKĄ, CZY ZGADASZ SIĘ NA RETUSZ PRZY UŻYCIU AI?

Pod nim widnieją możliwe obiekty, informacja o braku wykonywania retuszu oraz przyciski „ZGADZAM SIĘ” i „BEZ RETUSZU”. Zapisanie zgody pozostawia obraz identyczny. Wykrycie to wskazówka modelu, więc możliwe są pomyłki i przeoczenia.

## Dwa poziomy detekcji

1. Wbudowany Human / CenterNet rozpoznaje podstawowe przedmioty, m.in. laptop, telefon i butelkę. Przedmioty całkowicie usunięte razem z tłem są odrzucane. Biżuteria i ubranie nie są traktowane jako zbędny obiekt. Ten model **nie ma klasy mikrofon**.
2. Dodatkowy **OWL-ViT w ONNX, q8, CPU**, przez Transformers.js 3.8.1, rozpoznaje po opisach mikrofon, statyw mikrofonu, laptop, telefon, mównicę, butelkę i krzesło. Działa na lokalnej wyciętej sylwetce na białym tle, bez zapytań sieciowych. Próg 0.15 wymaga kalibracji na rzeczywistych zdjęciach; wynik modelu nie jest gwarancją wykrycia wszystkich mikrofonów.

## Instalacja w Codespaces

Przy aktualizacji zatrzymaj aplikację przez Control+C i wykonaj:

```bash
git pull --ff-only origin main && bash .devcontainer/setup.sh && bash .devcontainer/start.sh
```

Instalator próbuje jednorazowo pobrać dodatkowy model. Może to potrwać kilka minut. Repozytorium modelu: [Xenova/owlvit-base-patch32](https://huggingface.co/Xenova/owlvit-base-patch32). Skrypt używa przypiętej rewizji z kodu aplikacji, weryfikuje sumy SHA-256 plików LFS i identyfikatory Git pozostałych plików, zapisuje pochodzenie oraz sumy w `.runtime/objects/owlvit-base-patch32/impact-model-manifest.json`. Ponowna instalacja sprawdza sumy już pobranych plików.

Jeśli pobranie nie uda się, aplikacja nadal działa, a detekcja ma status ograniczony. Wtedy mikrofony nie są automatycznie rozpoznawane. Po przywróceniu dostępu do sieci ponów `npm run setup:objects` i uruchom aplikację ponownie. Podczas pobierania modelu nie są przesyłane żadne zdjęcia. Potrzebne domeny: `huggingface.co`, CDN w `*.hf.co` i `*.xethub.hf.co`.

## Co zweryfikowano w tej iteracji

Sprawdzono filtrowanie przedmiotów w masce, fallback bez dodatkowego modelu, komunikat i decyzje oraz identyczność pobranego PNG przed i po zgodzie. Wagi zostały pobrane po rozszerzeniu dostępu sieciowego, a ponowne uruchomienie instalatora potwierdziło ich sumy. Rewizja: `b75f4e52949639c3bb0b96546ea4149482f6e7ef`; SHA-256 q8 ONNX: `06af49bd5db977936bcddad2b45d0031072673517579d15b8cb42bf015a94156`.

`npm run check:objects` wykonało rzeczywistą inferencję lokalnie: biały pusty obraz nie zwrócił obiektów. Na syntetycznej ilustracji mikrofonu model zwrócił klasę mikrofon ze score około 0.52. **To potwierdza działanie modelu, ale nie skuteczność na rzeczywistych zdjęciach prelegentów.** Próg i przeoczenia należy ocenić na zdjęciach z mikrofonem, laptopem oraz bez dodatkowych przedmiotów. Do diagnostyki możesz użyć `npm run check:objects -- sciezka-do-wycietej-sylwetki.png`; zdjęcie pozostaje lokalne.

Przyszły retusz wymaga osobnej integracji, dokładnej maski obiektu i świadomej zgody na odtworzenie zasłoniętych fragmentów. Obecna zgoda nie uruchamia żadnej takiej operacji.
