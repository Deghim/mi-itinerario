# Puente histórico de Google Docs

Este directorio conserva el puente de Apps Script de nueve columnas como legado desactivado. No se despliega, no se llama desde el workflow y no participa en el runtime actual. La importación vigente es manual y local mediante `scripts/google-doc-import.mjs`.

`Parser.gs`, `Code.gs` y `appsscript.json` quedan como referencia de una migración futura explícita. El parser legado exige nueve encabezados; no lo uses para importar el Doc actual de ocho columnas.

El importador vigente acepta el HTML real de ocho encabezados, reconstruye fechas fusionadas, conserva vacíos, enlaces por celda y texto fuera de tabla, y escribe los JSON de forma atómica. No guardes HTML exportado, TXT, cabeceras, tickets, códigos ni datos privados en el repositorio.
