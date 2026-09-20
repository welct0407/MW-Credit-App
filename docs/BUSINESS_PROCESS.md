# Daily cash statement business process

The authoritative editable diagram is [BUSINESS_PROCESS.drawio](BUSINESS_PROCESS.drawio). [BUSINESS_PROCESS.png](BUSINESS_PROCESS.png) is its rendered review copy. Regenerate both after a process change:

```powershell
python scripts/generate-business-process.py
& 'C:\Program Files\draw.io\draw.io.exe' --export --format png --scale 1.2 --output docs\BUSINESS_PROCESS.png docs\BUSINESS_PROCESS.drawio
```

The diagram reflects the production behavior: the 00:15 Bangkok timer, latest completed calendar day, read-only R010 snapshot, bilingual rendering, current Partner opt-in/language/identity checks, Instagram delivery, complete Microsoft Graph email fallback, and separate handling of accepted, definitely unsent and uncertain outcomes.
