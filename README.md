# Courier Multi-Platform Analytics

Aplikacja Android do rejestrowania i analizy pracy kuriera korzystającego z jednej lub kilku platform dostawczych, takich jak Glovo, Bolt Food czy Uber Eats.

## Cel projektu

Celem systemu jest zebranie danych o pracy kuriera w jednym miejscu i umożliwienie analizy własnej efektywności niezależnie od konkretnej platformy.

Aplikacja ma umożliwiać m.in.:

- rejestrowanie zmian roboczych,
- zapisywanie zarobków i liczby zamówień dla jednej lub wielu platform,
- opcjonalne podanie przejechanego dystansu,
- przeglądanie historii pracy,
- analizę wyników i trendów,
- porównywanie platform,
- rejestrowanie podstawowych kosztów,
- prezentację wartości brutto i szacowanego netto.

## Technologie

### Frontend / Android
- React
- Tailwind CSS
- Chart.js
- Capacitor

### Backend
- Node.js
- Express.js
- REST API

### Baza danych
- PostgreSQL

### Bezpieczeństwo
- JWT
- hashowanie haseł
- autoryzacja zasobów użytkownika
- walidacja danych wejściowych

## Architektura

```text
Android App
React + Capacitor
        │
        │ HTTPS / JSON
        ▼
Node.js + Express.js
REST API
        │
        │ SQL
        ▼
PostgreSQL
```

## Główny flow

```text
Start Shift
↓
praca kuriera
↓
Stop Shift
↓
optional distance
↓
platform + earnings + orders
↓
optional second platform
↓
Save
↓
History / Analytics
```

## Status

Projekt znajduje się na początku implementacji. Docelową formą produktu jest aplikacja Android. React może być uruchamiany w przeglądarce podczas developmentu, ale osobna publiczna wersja webowa nie jest celem projektu.
