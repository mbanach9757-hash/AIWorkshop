# Kalkulator budżetu marketingowego i ROI

Aplikacja webowa (MVP) zbudowana na podstawie PRD „Kalkulator budżetu marketingowego i ROI”.
Marketer wpisuje roczny budżet, dzieli go procentowo między kanały i od razu widzi
oczekiwany zysk, całkowity zwrot i łączny ROI.

## Uruchomienie

Aplikacja działa w całości w przeglądarce – bez backendu, bazy danych i kroku budowania.

```bash
npm start          # albo: python3 -m http.server 8080
# otwórz http://localhost:8080
```

Można też po prostu otworzyć `index.html` w przeglądarce lub wrzucić katalog na dowolny
hosting statyczny (GitHub Pages, Netlify itp.).

## Testy

```bash
npm test           # node --test (Node 18+)
```

Testy sprawdzają m.in. przykład z PRD (500 000 PLN, 95% → zysk 787 500 PLN, ROI 165,79%),
walidację pól, format liczb i wydajność dla 50 kategorii.

## Struktura

| Plik | Opis |
|---|---|
| `index.html` | Jeden ekran aplikacji |
| `css/styles.css` | Wygląd, responsywność (od 360 px), tryb ciemny |
| `js/calc.js` | Logika obliczeń, walidacja i formatowanie (bez zależności od DOM) |
| `js/app.js` | Interfejs: tabela kategorii, pasek przydziału, wyniki, wykres, zapis lokalny |
| `tests/calc.test.js` | Testy jednostkowe logiki |

## Realizacja wymagań PRD

- **F1–F2** – budżet (> 0, maks. 2 miejsca po przecinku, wyświetlany jako `1 200 000,00`) i waluta PLN/EUR/USD (zmienia tylko symbol).
- **F3–F4** – 9 domyślnych kategorii; dodawanie (1–40 znaków, nazwa unikalna), zmiana nazwy w tabeli, usuwanie z potwierdzeniem, gdy kategoria ma wartości; przywracanie domyślnych, gdy lista jest pusta.
- **F5–F7** – % budżetu (0–100, 1 miejsce po przecinku), ROI (od −100%, ostrzeżenie powyżej 1000%), kwota, zysk netto i całkowity zwrot dla każdej kategorii.
- **F8** – zysk całkowity, całkowity zwrot i łączny ROI liczony od kwoty przydzielonej (średnia ważona), przeliczane przy każdym naciśnięciu klawisza.
- **F9** – pasek „Przydzielono X%” (zielony / żółty / czerwony + ikona i tekst), kwota nieprzydzielona lub przekroczona.
- **F10** – wykres donut w SVG; nieprzydzielona część jako szary wycinek, kategorie z 0% pominięte, legenda z wartościami i podpowiedź po najechaniu.
- **F11** – automatyczny zapis w `localStorage`, przycisk „Wyczyść plan” z potwierdzeniem.

**Dokładność:** obliczenia wykonywane są na liczbach całkowitych `BigInt` w stałej skali
(grosze, dziesiąte części procenta, setne części ROI) – zaokrąglenie tylko przy wyświetlaniu.

**Dostępność:** etykiety pól, komunikaty błędów powiązane przez `aria-describedby`,
pełna obsługa klawiaturą, natywne okno `<dialog>`, kolory statusu zawsze uzupełnione tekstem i ikoną.

## Decyzje dotyczące otwartych pytań z PRD

- Łączny ROI liczony jest **od kwoty przydzielonej** (165,79% w przykładzie), zgodnie z sekcją „Logika obliczeń”.
- Technologia: czysty HTML/CSS/JavaScript bez frameworka – najprostszy hosting i ładowanie poniżej 2 s.
