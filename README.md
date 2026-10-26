# CourStat

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

### Android

Wymagane są Android Studio, JDK 21, Android SDK Platform 36, Build Tools 36.0.0 i Platform Tools (`adb`). W Android Studio wybierz JDK 21 jako Gradle JDK. Projekt natywny znajduje się w `frontend/android`; `webDir` wskazuje build Vite w `dist`.

Do developmentu na Android Emulatorze uruchom backend, emulator i w katalogu `frontend` wykonaj:

```powershell
npm.cmd run android:sync:emulator
npm.cmd run android:open
```

Tryb Vite `android-emulator` pobiera `VITE_API_BASE_URL` z `frontend/.env.android-emulator`: `http://10.0.2.2:3000/api`. Nie wymaga `adb reverse`. Przeglądarka na Windows nadal korzysta z `frontend/.env` (domyślnie `http://localhost:3000/api`) przez `npm.cmd run dev` lub zwykły `npm.cmd run build`. Zmienna `VITE_API_BASE_URL` ustawiona w terminalu ma pierwszeństwo przed plikami `.env`; usuń ją przed buildem emulatora, jeśli wskazuje inny adres.

Telefon z debugowaniem USB może nadal korzystać z `VITE_API_BASE_URL=http://localhost:3000/api` w `frontend/.env`. Po podłączeniu telefonu, w katalogu `frontend`, wykonaj:

```powershell
adb reverse tcp:3000 tcp:3000
npm.cmd run android:sync
npm.cmd run android:open
```

`adb` musi być dostępne w PATH (katalog `platform-tools` Android SDK). Przy kilku urządzeniach wybierz jedno przez `adb -s <id> reverse tcp:3000 tcp:3000`. Backend domyślnie dopuszcza origin przeglądarki oraz `https://localhost` używany przez Capacitor. HTTP do `localhost`, `127.0.0.1` i `10.0.2.2` oraz mixed content są dozwolone tylko w wariancie debug. Po odłączeniu telefonu może być konieczne ponowienie `adb reverse`.

W Android Studio wybierz urządzenie i uruchom wariant `debug` przyciskiem Run. Alternatywnie użyj `npm.cmd run android:run:emulator` dla emulatora lub `npm.cmd run android:run` dla telefonu USB. APK można zbudować poleceniem `.\gradlew.bat assembleDebug` z katalogu `frontend/android`; wynik to `app/build/outputs/apk/debug/app-debug.apk`. Zmiana adresu API lub kodu React wymaga ponownego `android:sync:emulator` (emulator) lub `android:sync` (USB), a następnie ponownego uruchomienia aplikacji przez Run. Wersja release wymaga buildu z adresem backendu HTTPS.

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
