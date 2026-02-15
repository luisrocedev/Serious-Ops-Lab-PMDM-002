# Serious Ops Lab (PMDM · DAM2)

Prototipo de **serious game** basado en ejercicios de clase de control gestual con MediaPipe + mapa OpenStreetMap + lógica de algoritmo genético.

## Base de clase respetada

- `003-manos.html`
- `004-mover manos.html`
- `007-pinch.html`
- `012-algoritmo genetico coches.html`

Se mantiene la temática: control gráfico con manos y toma de decisiones optimizadas por GA, orientado a un caso empresarial (operaciones logísticas).

## Mejoras de calado

- Dashboard operativo completo con mapa, simulador GA, webcam y telemetría.
- Control gestual real:
  - 1 mano cerrada: pan del mapa
  - 2 manos cerradas: pinch zoom
- Persistencia SQL robusta:
  - operadores
  - sesiones
  - decisiones por frame
  - eventos de simulación
- Leaderboard e historial por operador.

## Ejecutar

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

- URL: `http://127.0.0.1:5091`

## Estructura

- `app.py`
- `templates/index.html`
- `static/app.js`
- `static/styles.css`
- `docs/Actividad_Prototipo_SeriousGames_53945291X.md`
