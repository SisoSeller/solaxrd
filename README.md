# SolaxRD — sito

Landing e download di SolaxRD.

## Online

https://sisoseller.github.io/solaxrd/

## Locale

```powershell
python -m http.server 4173
```

Poi apri `http://127.0.0.1:4173`.

## Aggiorna il setup

Quando esce una nuova `SolaxRD-Setup.exe`:

```powershell
powershell -File .\sync-download.ps1
```

Poi commit e push. Il file sta in `download/SolaxRD-Setup.exe`.
