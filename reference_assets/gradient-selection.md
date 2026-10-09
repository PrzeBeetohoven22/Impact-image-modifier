# Wybrany gradient

8 października 2026 użytkownik wskazał czerwono-różowy gradient z pomarańczowymi przejściami i potwierdził, że czarne marginesy nie należą do tła. Następnie przesłał kwadratowy PNG bez czarnych marginesów w archiwum `Projekt bez nazwy.png.zip`.

Plik źródłowy znajduje się w `reference_assets/impact-gradient-original.png`. Zachowano jego bajty bez zmian. Ma 1200 × 1200 px, przestrzeń sRGB i kanał alfa całkowicie nieprzezroczysty. SHA-256: `78ff19aded3018746429e952cf9c18b09ce99f95c909e2629a178f6d91132279`.

Domyślne tło aplikacji: `assets/impact-gradient-1600x1200.png`, 1600 × 1200 px, PNG, sRGB z osadzonym profilem ICC, bez kanału alfa. SHA-256: `605679c7a905d9c0c999626b61253afd5773ce61ceab8199c4c2d8c9209603d7`.

Wersja docelowa została przygotowana przez istniejący deterministyczny importer `prepareGradient(..., "cutout")`. Oryginał wypełnia płótno 4:3 przez jednolite skalowanie i symetryczne przycięcie góry oraz dołu; wykorzystany obszar odpowiada środkowym 1200 × 900 px źródła. Nie rozciągnięto proporcji, nie odtworzono gradientu generatywnie i nie zastosowano filtrów sylwetki.

Serwer wczytuje i waliduje domyślny PNG przed uruchomieniem. Każda nowa sesja otrzymuje to tło automatycznie i pokazuje jego podgląd. Własny upload może zmienić tło w obrębie sesji. W szablonie Canva należy użyć dokładnie wersji z `assets/impact-gradient-1600x1200.png`, aby uzyskać zgodność tła między lokalnym podglądem a Canva.

Gradient jest gotowy. Kalibracja kadrowania sylwetki i filtrów nadal wymaga źródłowego zdjęcia oraz zatwierdzonego przykładu wyniku. Nie należy uznawać samego dodania gradientu za wykonaną kalibrację zdjęć ani konfigurację konta Canva.
