# Wybrany gradient

Użytkownik wskazał czerwono-różowy gradient z pomarańczowymi przejściami, wykluczył czarne marginesy, a następnie przesłał kwadratowy PNG w archiwum `Projekt bez nazwy.png.zip`.

Źródło `reference_assets/impact-gradient-original.png` ma 1200 × 1200 px, sRGB i nieprzezroczysty kanał alfa. Bajty pozostały bez zmian. SHA-256: `78ff19aded3018746429e952cf9c18b09ce99f95c909e2629a178f6d91132279`.

9 października 2026 użytkownik zatwierdził stały kwadrat przy lewej i dolnej krawędzi oraz 10% bieli nad nim, na płótnie 1600 × 1200. Cały oryginał jest proporcjonalnie skalowany do 1080 × 1080 i umieszczony w (0, 120). Jego wnętrze nie jest obcinane ani filtrowane. Reszta płótna jest biała.

Gotowe tło `assets/impact-gradient-1600x1200.png` jest PNG sRGB z osadzonym ICC, bez alfa. SHA-256: `c245181035bf2d50ec3830583d05940218545907898c35be6142819eca55efb1`. Można je odtworzyć komendą `npx tsx scripts/build-background.ts`; zwykłe uruchomienie korzysta z dołączonego pliku.

Serwer wczytuje i waliduje tło przed uruchomieniem, przypisuje je każdej sesji i blokuje podmianę. Filtry działają wyłącznie na sylwetce. [Opis geometrii i kalibracji](../docs/ITERACJA-KADROWANIA.md) zawiera zatwierdzone kotwice i dalszą ocenę pomiaru głowy.
