# Courier Multi-Platform Analytics

Aplikacja Android do rejestrowania i analizy pracy kuriera korzystającego z jednej lub kilku platform dostawczych, takich jak Glovo, Bolt Food czy Uber Eats.

Projekt jest w trakcie realizacji.

## Cel projektu

Celem systemu jest zebranie danych o pracy kuriera w jednym miejscu i umożliwienie analizy własnej efektywności niezależnie od konkretnej platformy.

Docelowo aplikacja ma umożliwiać m.in.:

- rejestrowanie zmian roboczych,
- zapisywanie zarobków i liczby zamówień dla jednej lub wielu platform,
- opcjonalne podanie przejechanego dystansu,
- przeglądanie historii pracy,
- analizę wyników i trendów,
- porównywanie platform,
- rejestrowanie podstawowych kosztów,
- prezentację wartości brutto i szacowanego netto.

## Technologie

Poniższy zestaw opisuje docelowy stack projektu.

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

## Docelowy flow

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

## Uruchomienie lokalne

Wymagania dla całego projektu: Node.js 22.x od wersji 22.22.0 albo Node.js 24 lub nowszy oraz npm. Polecenia poniżej są przeznaczone dla PowerShell. Uruchom frontend i backend w dwóch osobnych terminalach, zaczynając w katalogu głównym repozytorium.

Konfiguracja jest opisana w [backend/.env.example](backend/.env.example) i [frontend/.env.example](frontend/.env.example). Przy pierwszym uruchomieniu można skopiować odpowiedni plik do `.env` w jego katalogu. Lokalnych plików `.env` nie należy dodawać do repozytorium.

### Backend

```powershell
cd backend
npm.cmd ci
npm.cmd run dev
```

Domyślny adres: `http://localhost:3000`.

### Frontend

```powershell
cd frontend
npm.cmd ci
npm.cmd run dev
```

Domyślny adres: `http://localhost:5173`.

## Kontrole

Frontend:

```powershell
cd frontend
npm.cmd run lint
npm.cmd run build
```

Backend:

```powershell
cd backend
npm.cmd run lint
npm.cmd test
```
