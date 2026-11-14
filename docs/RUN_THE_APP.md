# Run the app

## Tonight’s demo

1. Start it in PowerShell: `pnpm demo`.
2. On first use, seed the demo accounts: `pnpm demo:seed` (the command prints the demo logins).
3. On this PC, open <http://localhost:8081>. On an iPhone, install **Expo Go**, scan the QR
   printed by `pnpm demo`, and tap **Open in Expo Go**. Allow Local Network access when asked.
   Physical iPhones also require the same Expo account in Expo Go and the CLI: run
   `npx expo login` on the PC, then sign in from Expo Go's account icon and tap **Try Again**.
4. If school or guest Wi-Fi blocks devices from reaching each other, turn on **Mobile hotspot** on
   the laptop, connect the iPhone to that hotspot, then restart with the laptop hotspot adapter’s
   IPv4 address: `pnpm demo -LanIp <hotspot IPv4>`. Find that address with `ipconfig` (often
   `192.168.137.1`). Scan the newly printed QR; an older QR contains the previous network address.
5. Demo admin: **Nkam Ticha**, `6 99 00 01 01`, PIN `482615`.

Stop the app with `pnpm demo:stop`.

How to start NjangiTrust on this PC and open it on your iPhone, on Android and in the browser.
Everything runs on your PC; phones reach it over Wi-Fi or the laptop hotspot.

## First time only

Already done on this PC. On a new PC:

1. Install Node.js 22+, pnpm, PostgreSQL 16 and Redis in WSL (`kali-linux`), then `pnpm install`.
2. Create the databases: `apps/api/scripts/setup-db.ps1` (it asks for the postgres password and
   writes `apps/api/.env`).
3. Allow phones through Windows Firewall (once). Open PowerShell **as administrator** and run:

   ```powershell
   New-NetFirewallRule -DisplayName 'NjangiTrust dev' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000,8081 -Profile Private
   ```

   It opens only ports 3000 (API) and 8081 (app) and only on private networks (your home or
   office Wi-Fi), never on public Wi-Fi. Your Wi-Fi must be set to **Private network**
   (Settings > Network & internet > Wi-Fi > your network). If Windows shows a firewall pop-up for
   Node.js, tick **Private** only.

## Every day

```powershell
pnpm demo
```

It checks PostgreSQL, starts Redis, applies new database migrations (it never deletes data),
starts the API and the app server in two windows, finds your PC's Wi-Fi address and prints a QR
code plus the links. Running it again while it is up just prints the links again.

The first time, create the demo people and groups (the logins and PINs are printed):

```powershell
pnpm demo:seed
```

## iPhone (Expo Go)

1. Install **Expo Go** from the App Store.
2. Connect the iPhone to the **same Wi-Fi** as the PC.
3. Open the **Camera** app, point it at the QR code that `pnpm demo` printed (also shown in the
   Expo window) and tap **Open in Expo Go**. Or, in Expo Go, type the `exp://...` address it
   printed.
4. When iOS asks to let Expo Go find devices on your local network, tap **Allow**.

The first load takes a minute while the app is built. Shake the iPhone for the developer menu
(Reload).

## Android (Expo Go)

Install **Expo Go** from the Play Store, join the same Wi-Fi, open Expo Go, tap
**Scan QR code** and scan the same QR code.

## Browser

- On this PC: <http://localhost:8081>
- On another computer or tablet on the Wi-Fi: `http://<PC address>:8081` (printed by
  `pnpm demo`). Over plain http your sign-in is not kept after a page reload there; on this PC
  (localhost) it is.

## Stop

```powershell
pnpm demo:stop
```

It closes the API and app windows that `pnpm demo` opened. PostgreSQL and Redis keep running
(`pnpm services:stop` stops Redis).

## Other ports

If 3000 or 8081 is busy: `pnpm demo -ApiPort 3100 -WebPort 8091`, stop with
`pnpm demo:stop -ApiPort 3100 -WebPort 8091`, and seed with
`$env:DEMO_API_URL='http://localhost:3100'; pnpm demo:seed`. Add these ports to the firewall rule
too (as administrator):
`Set-NetFirewallRule -DisplayName 'NjangiTrust dev' -LocalPort 3000,8081,3100,8091`.

## Troubleshooting

| Problem | Fix |
|---|---|
| **Redis does not answer** (often after a reboot) | `pnpm demo` restarts a stuck Redis by itself. If it still fails: `wsl -d kali-linux -u root -- pkill -9 redis-server`, then `pnpm demo` again. |
| **PostgreSQL is not running** | PowerShell as administrator: `Start-Service postgresql-x64-16`. |
| **Phone shows "Could not connect" or loads forever** | Same Wi-Fi on both (not a guest network, not mobile data); Wi-Fi set to Private; firewall rule above created; on iPhone, Settings > Expo Go > **Local Network** on. Test from the phone's browser: `http://<PC address>:3000/health` must show `"status"`. |
| **Wrong address detected** (VPN, several networks) | `pnpm demo -LanIp 192.168.x.x` with the address shown by `ipconfig` for your Wi-Fi. |
| **The PC's address changed** (new Wi-Fi) | `pnpm demo:stop`, then `pnpm demo`. Scan the new QR code. |
| **Old screens or strange errors in the app** | `pnpm demo:stop`, then `pnpm demo -ClearCache`. |
| **"Port 3000 is already used"** | Another `pnpm dev:api` or `dev:mobile` is running: close it, or use other ports (above). |
| **Installs or downloads hang** (IPv6 on this network) | Before `pnpm install`: `$env:NODE_OPTIONS='--dns-result-order=ipv4first'`. |
| **Expo Go says the SDK version is not supported** | Update Expo Go from the App Store or Play Store. |
