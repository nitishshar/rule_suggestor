# Business Rule Expression Suggestor

Angular app for writing business rules with autocomplete and Drools when-clause generation.

## Requirements

- **Node.js** 18+ (tested with v20.17.0)
- **npm** 8+

## Setup

```powershell
cd c:\citiwork\rule_suggestor
npm install
```

## Run / Build

- **Start dev server:** `npm start`
- **Build:** `npm run build`

The `build` and `start` scripts use a small launcher (`scripts/ng-with-rxjs.js`) so Node can resolve the `rxjs` module used by the Angular CLI. If you see **"Cannot find module 'rxjs'"**, that launcher is already in use; if the error persists, try a clean install below.

## If you see "Cannot find module 'rxjs'"

1. **Clean reinstall** (from project root):

   ```powershell
   Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
   Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue
   npm install
   npm run build
   ```

2. **Windows long paths:** If `npm install` fails with many `TAR_ENTRY_ERROR` / "no such file or directory" warnings, enable long paths:

   - Run PowerShell **as Administrator** and run:  
     `New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force`
   - Or move the project to a shorter path (e.g. `C:\rs`) and run `npm install` there.

3. **Antivirus:** Temporarily exclude the project folder from real-time scanning if installs are slow or fail.

## Configuration

Rule phrases, data elements, operators, and samples are driven by:

- `src/assets/config/rule-suggestor-config.json`

Edit that file to change suggestions and Drools behavior without code changes.
