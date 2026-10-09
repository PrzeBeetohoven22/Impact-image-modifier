# Konfiguracja Canva Connect

Połączenie Canva w ChatGPT nie jest autoryzacją tej aplikacji. Aplikacja korzysta z własnego OAuth 2.0 z PKCE; sekrety, access tokeny i refresh tokeny pozostają na serwerze. Tokeny są przechowywane tylko w pamięci sesji i znikają po restarcie lub po 20 minutach bezczynności.

## Zweryfikowane możliwości i ograniczenia

Sprawdzono oficjalne OpenAPI i przykłady Canva Connect z repozytorium [canva-sdks/canva-connect-api-starter-kit](https://github.com/canva-sdks/canva-connect-api-starter-kit), commit `17bdd3be3356c1cf5f856d762da7d85d30f77b91`, 8 października 2026. Bezpośrednia witryna dokumentacji była blokowana przez politykę sieci tej instancji.

- [Upload assets](https://www.canva.dev/docs/connect/api-reference/assets/create-asset-upload-job/): binarny upload i odpytywanie zadania. Operacja stabilna.
- [Brand template dataset](https://www.canva.dev/docs/connect/api-reference/brand-templates/get-brand-template-dataset/): odczyt nazw i typów pól. Operacja stabilna.
- [Autofill z szablonu marki](https://www.canva.dev/docs/connect/api-reference/autofills/create-design-autofill-job/): `create_from_brand_template` z polem obrazu; operacja stabilna, wymaga Enterprise. Specyfikacja przewiduje ograniczony trial podczas developmentu dla płatnych planów. Business sam w sobie nie dowodzi dostępu produkcyjnego.
- [Export PNG](https://www.canva.dev/docs/connect/api-reference/exports/create-design-export-job/): zadanie asynchroniczne, z żądaniem 1600 × 1200, jednej strony, bez przezroczystości. Operacja stabilna.
- Kopiowanie zwykłego designu i autofill `create_from_design` są preview. Nie wykorzystano tych ścieżek. Nie użyto automatyzacji przeglądarki do pracy w Canva.

Nie wykonano rzeczywistej próby Canva: nie dostarczono własnej integracji OAuth ani szablonu. Testy używają kontrolowanych odpowiedzi API i nie potwierdzają uprawnień konta.

## Przygotowanie konta i szablonu

1. W Canva Developer Portal utwórz integrację **Outside Canva → Canva REST APIs**. Dla narzędzia wewnętrznego wybierz właściwy dostęp dla zespołu.
2. Włącz zakresy `asset:read`, `asset:write`, `brandtemplate:content:read`, `brandtemplate:meta:read`, `design:content:read`, `design:content:write`, `design:meta:read`.
3. Zarejestruj dokładny adres callback serwera `/api/canva/callback`. W lokalnym developmentcie callback musi prowadzić przez adres interfejsu (port 5173), aby używać tej samej sesji. Dla builda obsługiwanego przez Node użyj portu 3001. W hostowanym narzędziu użyj rzeczywistego adresu HTTPS i ustaw `APP_ORIGIN` na ten sam origin.
4. Przygotuj **Brand Template**: jedna strona 1600 × 1200. Wstaw zatwierdzone tło w pełnym płótnie i zablokuj je. Nad nim umieść pojedynczą warstwę obrazu zajmującą całe płótno, bez dodatkowego kadrowania lub filtrów, oznaczoną jako pole danych np. `SPEAKER`.
5. Pole otrzyma przezroczysty PNG 1600 × 1200 zawierający wyłącznie wykadrowaną i przefiltrowaną sylwetkę. Tło i pozostałe elementy szablonu pozostaną osobno edytowalne. Cechy twarzy nie są regenerowane. Sama sylwetka jest obrazem, nie zbiorem wektorowych części ciała.
6. Zapisz `CANVA_CLIENT_ID`, `CANVA_REDIRECT_URI`, `CANVA_BRAND_TEMPLATE_ID` i `CANVA_IMAGE_FIELD` w konfiguracji środowiska.
7. Skonfiguruj sekret `CANVA_BASIC_AUTH`: Base64 ciągu `client_id:client_secret`. Base64 nie szyfruje sekretu. Wpisz go wyłącznie w bezpiecznych ustawieniach, z dozwolonym odbiorcą `api.canva.com`. Ten wariant umożliwia bezpośrednią podmianę placeholdera przez proxy w nagłówku Basic. Alternatywnie w lokalnym środowisku można użyć rzeczywistego `CANVA_CLIENT_SECRET`; nie należy kodować placeholdera sekretu do Base64, bo proxy nie zobaczy go w nagłówku.
8. Zapewnij HTTPS egress do `www.canva.com`, `api.canva.com` i `export-download.canva.com`. Dokumentacja używa `www.canva.dev` / `canva.dev`. Lokalna analiza i segmentacja pobierają modele z zainstalowanych paczek npm, bez zewnętrznych usług zdjęć.

## Próba na docelowym koncie

W interfejsie przygotuj zdjęcie, sprawdź krawędzie i kadr, następnie połącz konto Canva i wybierz utworzenie projektu. Sprawdź, że:

- użytkownik jest uprawniony do Autofill, a wskazane pole szablonu ma typ `image`;
- utworzony projekt otwiera się w edytorze, tło i sylwetka są osobnymi warstwami;
- PNG jest jedną stroną, 1600 × 1200; aplikacja sprawdza to przed udostępnieniem pobrania;
- kompozycja w Canva zgadza się z lokalnym podglądem i zatwierdzonym wzorcem.

Błąd eksportu zachowuje adres utworzonego projektu. Ponowne żądanie eksportu dla niezmienionego kadru nie tworzy kolejnego projektu. Błąd lub timeout Autofill może pozostawić zdalne zadanie/asset; sprawdź bibliotekę Canva przed ponawianiem. Aplikacja nie usuwa zdalnych projektów ani assetów. Lokalny limit retencji nie obejmuje plików świadomie wysłanych do Canva.

Opcjonalny `npm run canva:poc -- <layer.png> <output.png>` używa bezpiecznie skonfigurowanego `CANVA_POC_ACCESS_TOKEN` i nie nadpisuje pliku wyniku. Ten token nie jest potrzebny przy OAuth w interfejsie. Dostęp do realnego konta, wygląd warstw i uprawnienia muszą być sprawdzone w rzeczywistej próbie; same testy API ich nie zastępują.
