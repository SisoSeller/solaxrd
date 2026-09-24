# SolaxRD — sito

Sito di presentazione e download di SolaxRD.

## Apri in locale

Dalla cartella `site`:

```powershell
python -m http.server 4173
```

Poi vai su `http://127.0.0.1:4173`.

## Aggiorna il setup

Quando esce una nuova `SolaxRD-Setup.exe`, copiala così:

```powershell
powershell -File .\sync-download.ps1
```

Il file da scaricare sta in `download/SolaxRD-Setup.exe`.
