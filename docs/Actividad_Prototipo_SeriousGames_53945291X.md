# Actividad 002 · Proyecto serious games

**Módulo:** Programación multimedia y dispositivos móviles  
**Curso:** DAM2  
**Alumno:** 53945291X  
**Fecha:** 15/02/2026

## 1) Base de ejercicio de clase utilizada

El prototipo parte directamente de ejercicios trabajados en clase donde se aplican tecnologías gráficas a entornos no lúdicos puros:

- Control de mapa con manos (MediaPipe + OpenStreetMap):
  - `003-manos.html`
  - `004-mover manos.html`
  - `007-pinch.html`
- Optimización mediante algoritmo genético:
  - `012-algoritmo genetico coches.html`

Se respeta la temática base: **interacción gestual + visualización avanzada + decisión algorítmica**.

## 2) Modificaciones estéticas y visuales (calado alto)

1. Interfaz profesional de serious game:
   - mapa principal a pantalla completa,
   - panel táctico lateral con KPIs,
   - tabla de ranking e historial,
   - capa de simulación GA superpuesta en canvas.

2. Visualización avanzada:
   - depuración de landmarks en tiempo real,
   - feedback continuo de score/riesgo/incidencias,
   - estilo visual corporativo para entorno empresarial.

## 3) Modificaciones funcionales (código + base de datos, calado alto)

1. Control gestual ampliado:
   - una mano cerrada para desplazamiento operativo del mapa,
   - dos manos cerradas para zoom pinch,
   - modo de observación sin gesto.

2. Motor de simulación GA aplicado a logística:
   - mutación de genoma de decisión (`speedBias`, `riskTolerance`, `lanePreference`),
   - evaluación recurrente de rollouts,
   - selección dinámica de estrategia por frame.

3. Persistencia y trazabilidad SQL completa:
   - `operators`: operadores del simulador,
   - `simulation_sessions`: sesión y métricas finales,
   - `simulation_decisions`: decisiones frame a frame,
   - `simulation_events`: eventos de operación.

4. API de segundo curso:
   - registro de operador,
   - apertura/cierre de sesión,
   - guardado de decisiones/eventos,
   - leaderboard global + historial individual.

## 4) Cumplimiento rúbrica (4 puntos)

- Se parte de ejemplo real de clase y se mantiene temática.
- Se realizan cambios visuales importantes y verificables.
- Se realizan cambios funcionales de mucho calado.
- Se integra base de datos y arquitectura cliente-servidor para justificar nivel de 2º.

## 5) Entrega técnica

Ruta:

- `Programación multimedia y dispositivos móviles/301-Actividades final de unidad - Segundo trimestre/002-Proyecto serious games/serious_ops_lab`

Contenido:

- `app.py`
- `templates/index.html`
- `static/app.js`
- `static/styles.css`
- `README.md`
- `requirements.txt`
- `docs/Actividad_Prototipo_SeriousGames_53945291X.md`
