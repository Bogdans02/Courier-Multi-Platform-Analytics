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

Wymagania dla całego projektu: Node.js 22.x od wersji 22.22.0 albo Node.js 24 lub nowszy, npm i PostgreSQL 16 lub nowszy. Polecenia poniżej są przeznaczone dla PowerShell. Uruchom frontend i backend w dwóch osobnych terminalach, zaczynając w katalogu głównym repozytorium.

Konfiguracja jest opisana w [backend/.env.example](backend/.env.example) i [frontend/.env.example](frontend/.env.example). Przy pierwszym uruchomieniu można skopiować odpowiedni plik do `.env` w jego katalogu. Lokalnych plików `.env` nie należy dodawać do repozytorium.

### Backend

W PostgreSQL utwórz lokalną rolę z możliwością logowania oraz bazę `courier_analytics`, której właścicielem jest ta rola. Ustaw właściwy `DATABASE_URL` w `backend/.env`, korzystając z przykładu konfiguracji. Backend wymaga działającego połączenia z bazą.

Ustaw również `JWT_SECRET` w `backend/.env`: losowy sekret o długości co najmniej 32 znaków. Backend sprawdza tę konfigurację przed uruchomieniem. Rzeczywistego sekretu nie należy dodawać do repozytorium.

```powershell
cd backend
npm.cmd ci
npm.cmd run db:migrate
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
npm.cmd test
npm.cmd run build
```

Backend:

```powershell
cd backend
npm.cmd run lint
npm.cmd test
npm.cmd run db:check
```

`db:check` sprawdza zapis i odczyt przykładowych danych, a następnie wycofuje je w transakcji. Testy integracyjne wymagają osobnej bazy `courier_analytics_test`, należącej do lokalnej roli testowej, i ustawienia `TEST_DATABASE_URL` w `backend/.env`:

```powershell
cd backend
npm.cmd run test:db
```

Testy tworzą i usuwają własny schemat w bazie testowej. Kolejne zmiany schematu dodawaj jako nowe numerowane pliki SQL w `backend/migrations/`; zastosowanych migracji nie edytuj.
