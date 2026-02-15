const ui = {
  operatorAlias: document.getElementById('operatorAlias'),
  startBtn: document.getElementById('startBtn'),
  endBtn: document.getElementById('endBtn'),
  leaderboardBody: document.getElementById('leaderboardBody'),
  historyBody: document.getElementById('historyBody'),
  score: document.getElementById('kpiScore'),
  deliveries: document.getElementById('kpiDeliveries'),
  incidents: document.getElementById('kpiIncidents'),
  risk: document.getElementById('kpiRisk'),
};

const webcam = document.getElementById('webcam');
const handDebug = document.getElementById('handDebug');
const debugCtx = handDebug.getContext('2d');
const gaCanvas = document.getElementById('gaCanvas');
const gaCtx = gaCanvas.getContext('2d');

const map = L.map('map').setView([39.4699, -0.3763], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
}).addTo(map);

const depot = [39.4699, -0.3763];
L.circleMarker(depot, { radius: 8, color: '#00ffbf' }).addTo(map).bindPopup('Centro logístico');

const hubs = [
  { name: 'Hospital Norte', coord: [39.4903, -0.3561], risk: 0.64 },
  { name: 'Planta Química', coord: [39.4458, -0.3904], risk: 0.77 },
  { name: 'Puerto', coord: [39.4470, -0.3232], risk: 0.58 },
  { name: 'Centro Comercial', coord: [39.4768, -0.4018], risk: 0.49 },
  { name: 'Polígono Sur', coord: [39.4312, -0.3774], risk: 0.66 },
];

hubs.forEach((hub) => {
  L.marker(hub.coord).addTo(map).bindPopup(`${hub.name} · Riesgo ${hub.risk.toFixed(2)}`);
});

const sim = {
  running: false,
  operatorId: null,
  sessionId: null,
  frameNo: 0,
  score: 0,
  deliveries: 0,
  incidents: 0,
  riskAccum: 0,
  decisionSinceLastSend: 0,
  startAt: 0,
  bestGenome: { speedBias: 0.7, riskTolerance: 0.45, lanePreference: 0.0 },
  traffic: [],
};

const gesture = {
  dragging: false,
  zooming: false,
  lastX: 0,
  lastY: 0,
  lastDist: 0,
};

function sizeCanvases() {
  const rect = gaCanvas.getBoundingClientRect();
  gaCanvas.width = Math.floor(rect.width * devicePixelRatio);
  gaCanvas.height = Math.floor(rect.height * devicePixelRatio);
  gaCtx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

  handDebug.width = 200;
  handDebug.height = 150;
}
window.addEventListener('resize', sizeCanvases);
sizeCanvases();

async function api(url, method = 'GET', body = null) {
  const options = { method, headers: {} };
  if (body !== null) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const response = await fetch(url, options);
  return response.json();
}

function updateKpis() {
  ui.score.textContent = Math.round(sim.score);
  ui.deliveries.textContent = sim.deliveries;
  ui.incidents.textContent = sim.incidents;
  const avgRisk = sim.deliveries + sim.incidents > 0 ? sim.riskAccum / (sim.deliveries + sim.incidents) : 0;
  ui.risk.textContent = avgRisk.toFixed(2);
}

function initTraffic() {
  sim.traffic = Array.from({ length: 14 }, (_, idx) => ({
    lane: idx % 3,
    y: Math.random() * 250,
    speed: 22 + Math.random() * 20,
    risk: 0.2 + Math.random() * 0.7,
  }));
}

function mutateGenome(base) {
  const c = (v, min, max) => Math.max(min, Math.min(max, v));
  return {
    speedBias: c(base.speedBias + (Math.random() - 0.5) * 0.24, 0.1, 1.2),
    riskTolerance: c(base.riskTolerance + (Math.random() - 0.5) * 0.24, 0.05, 0.95),
    lanePreference: c(base.lanePreference + (Math.random() - 0.5) * 0.4, -1, 1),
  };
}

function scoreGenome(genome, traffic) {
  let score = 0;
  let incidents = 0;
  let deliveries = 0;
  let riskAcc = 0;

  for (let i = 0; i < 60; i += 1) {
    const segment = traffic[(i * 3 + 7) % traffic.length];
    const laneAffinity = 1 - Math.abs(genome.lanePreference - (segment.lane - 1) / 1.2);
    const control = genome.speedBias * (1 - segment.risk * (1 - genome.riskTolerance));
    const risk = segment.risk * (1.2 - genome.riskTolerance);

    if (control > 0.36 && risk < 0.85) {
      deliveries += 1;
      score += 14 * laneAffinity + control * 10;
    } else {
      incidents += 1;
      score -= 8 + risk * 12;
    }

    riskAcc += risk;
  }

  return {
    score,
    deliveries,
    incidents,
    avgRisk: riskAcc / 60,
  };
}

function runGeneticTick() {
  const candidates = [sim.bestGenome, ...Array.from({ length: 46 }, () => mutateGenome(sim.bestGenome))];

  let best = null;
  for (const genome of candidates) {
    const result = scoreGenome(genome, sim.traffic);
    if (!best || result.score > best.result.score) {
      best = { genome, result };
    }
  }

  sim.bestGenome = best.genome;
  sim.score += best.result.score * 0.018;
  sim.deliveries += Math.round(best.result.deliveries * 0.015);
  sim.incidents += Math.round(best.result.incidents * 0.009);
  sim.riskAccum += best.result.avgRisk;
  sim.frameNo += 1;

  sim.decisionSinceLastSend += 1;
  if (sim.decisionSinceLastSend >= 5 && sim.sessionId) {
    sim.decisionSinceLastSend = 0;
    api('/api/session/decision', 'POST', {
      session_id: sim.sessionId,
      frame_no: sim.frameNo,
      decision: 'ga_optimize_route',
      score_delta: Math.round(best.result.score),
      risk_level: Number(best.result.avgRisk.toFixed(4)),
      payload: best.genome,
    }).catch(() => {});
  }

  if (Math.random() < 0.08 && sim.sessionId) {
    api('/api/session/event', 'POST', {
      session_id: sim.sessionId,
      event_type: 'route_replan',
      event_value: 1,
      payload: { frame: sim.frameNo, traffic_size: sim.traffic.length },
    }).catch(() => {});
  }

  updateKpis();
  drawGa(best);
}

function drawGa(best) {
  const w = gaCanvas.width / devicePixelRatio;
  const h = gaCanvas.height / devicePixelRatio;

  gaCtx.clearRect(0, 0, w, h);
  gaCtx.fillStyle = 'rgba(6,12,28,0.88)';
  gaCtx.fillRect(0, 0, w, h);

  gaCtx.fillStyle = '#c6d5ff';
  gaCtx.font = '13px Inter, sans-serif';
  gaCtx.fillText('Simulación GA (rutas logísticas)', 14, 22);
  gaCtx.fillStyle = '#89a3ec';
  gaCtx.fillText(`Frame ${sim.frameNo}`, 14, 42);

  const values = [
    ['speedBias', best.genome.speedBias, 1.2],
    ['riskTolerance', best.genome.riskTolerance, 1],
    ['lanePreference', (best.genome.lanePreference + 1) / 2, 1],
  ];

  values.forEach((entry, idx) => {
    const y = 70 + idx * 52;
    gaCtx.fillStyle = '#9ab0ef';
    gaCtx.fillText(entry[0], 14, y);
    gaCtx.fillStyle = '#1f2a46';
    gaCtx.fillRect(14, y + 10, w - 28, 16);
    gaCtx.fillStyle = '#4f7dff';
    gaCtx.fillRect(14, y + 10, (w - 28) * (entry[1] / entry[2]), 16);
    gaCtx.fillStyle = '#d7e3ff';
    gaCtx.fillText(entry[1].toFixed(3), w - 72, y + 22);
  });

  gaCtx.fillStyle = '#9ab0ef';
  gaCtx.fillText(`Best rollout score: ${best.result.score.toFixed(2)}`, 14, h - 34);
  gaCtx.fillText(`Deliveries:${best.result.deliveries}  Incidents:${best.result.incidents}  Risk:${best.result.avgRisk.toFixed(3)}`, 14, h - 14);
}

function closedHand(landmarks) {
  const thumb = landmarks[4];
  const index = landmarks[8];
  const dist = Math.hypot(thumb.x - index.x, thumb.y - index.y);
  return dist < 0.055;
}

function handleHands(results) {
  debugCtx.clearRect(0, 0, handDebug.width, handDebug.height);
  debugCtx.drawImage(results.image, 0, 0, handDebug.width, handDebug.height);

  if (results.multiHandLandmarks) {
    for (const landmarks of results.multiHandLandmarks) {
      drawConnectors(debugCtx, landmarks, HAND_CONNECTIONS, { color: '#00FF9D', lineWidth: 2 });
      drawLandmarks(debugCtx, landmarks, { color: '#FF2D8D', radius: 2 });
    }
  }

  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
    gesture.dragging = false;
    gesture.zooming = false;
    return;
  }

  const hands = results.multiHandLandmarks;

  if (hands.length >= 2 && closedHand(hands[0]) && closedHand(hands[1])) {
    const h1 = hands[0][4];
    const h2 = hands[1][4];
    const dist = Math.hypot(h1.x - h2.x, h1.y - h2.y);

    if (!gesture.zooming) {
      gesture.zooming = true;
      gesture.dragging = false;
      gesture.lastDist = dist;
    } else {
      const delta = (dist - gesture.lastDist) * 8;
      map.setZoom(map.getZoom() + delta);
      gesture.lastDist = dist;
    }
    return;
  }

  if (closedHand(hands[0])) {
    const p = hands[0][4];
    const sensitivity = 1200;
    if (!gesture.dragging) {
      gesture.dragging = true;
      gesture.zooming = false;
      gesture.lastX = p.x;
      gesture.lastY = p.y;
    } else {
      const dx = (p.x - gesture.lastX) * sensitivity;
      const dy = (p.y - gesture.lastY) * sensitivity;
      map.panBy([dx, -dy]);
      gesture.lastX = p.x;
      gesture.lastY = p.y;
    }
  } else {
    gesture.dragging = false;
    gesture.zooming = false;
  }
}

async function loadLeaderboard() {
  const data = await api('/api/leaderboard?limit=10');
  ui.leaderboardBody.innerHTML = (data.items || []).map((item) => `
    <tr>
      <td>${item.alias}</td>
      <td>${item.total_score}</td>
      <td>${item.deliveries}</td>
      <td>${Number(item.avg_risk).toFixed(2)}</td>
    </tr>
  `).join('');
}

async function loadHistory() {
  if (!sim.operatorId) return;
  const data = await api(`/api/operator/${sim.operatorId}/history?limit=8`);
  ui.historyBody.innerHTML = (data.items || []).map((item) => `
    <tr>
      <td>${item.result || '-'}</td>
      <td>${item.total_score}</td>
      <td>${item.incidents}</td>
    </tr>
  `).join('');
}

async function startSimulation() {
  const alias = ui.operatorAlias.value.trim();
  if (alias.length < 3) {
    ui.operatorAlias.focus();
    return;
  }

  const operator = await api('/api/operator/register', 'POST', { alias });
  if (!operator.ok) throw new Error(operator.error || 'No se pudo registrar operador');

  const session = await api('/api/session/start', 'POST', {
    operator_id: operator.operator.id,
    scenario: 'gesture-ga-logistics',
  });

  sim.operatorId = operator.operator.id;
  sim.sessionId = session.session_id;
  sim.frameNo = 0;
  sim.score = 0;
  sim.deliveries = 0;
  sim.incidents = 0;
  sim.riskAccum = 0;
  sim.decisionSinceLastSend = 0;
  sim.bestGenome = { speedBias: 0.7, riskTolerance: 0.45, lanePreference: 0.0 };
  sim.startAt = performance.now();
  sim.running = true;

  initTraffic();
  updateKpis();
  await loadLeaderboard();
  await loadHistory();

  api('/api/session/event', 'POST', {
    session_id: sim.sessionId,
    event_type: 'session_started',
    event_value: 1,
    payload: { scenario: 'gesture-ga-logistics' },
  }).catch(() => {});
}

async function stopSimulation() {
  if (!sim.sessionId) return;
  sim.running = false;

  const elapsed = (performance.now() - sim.startAt) / 1000;
  const totalActions = Math.max(1, sim.deliveries + sim.incidents);
  const avgRisk = sim.riskAccum / totalActions;
  const efficiency = sim.deliveries / totalActions;
  const result = sim.score >= 400 ? 'success' : 'review';

  await api('/api/session/end', 'POST', {
    session_id: sim.sessionId,
    result,
    total_score: Math.round(sim.score),
    deliveries: sim.deliveries,
    incidents: sim.incidents,
    avg_risk: Number(avgRisk.toFixed(4)),
    efficiency: Number(efficiency.toFixed(4)),
  });

  await api('/api/session/event', 'POST', {
    session_id: sim.sessionId,
    event_type: 'session_closed',
    event_value: Math.round(elapsed),
    payload: { elapsed_sec: Math.round(elapsed), efficiency: Number(efficiency.toFixed(3)) },
  });

  await loadLeaderboard();
  await loadHistory();

  sim.sessionId = null;
}

function gameLoop() {
  requestAnimationFrame(gameLoop);
  if (!sim.running) return;
  runGeneticTick();
}

const hands = new Hands({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/${file}`,
});
hands.setOptions({
  maxNumHands: 2,
  modelComplexity: 1,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5,
});
hands.onResults(handleHands);

const cam = new Camera(webcam, {
  onFrame: async () => {
    await hands.send({ image: webcam });
  },
  width: 200,
  height: 150,
});
cam.start();

ui.startBtn.addEventListener('click', () => {
  startSimulation().catch((error) => {
    alert(`Error al iniciar: ${error.message}`);
  });
});

ui.endBtn.addEventListener('click', () => {
  stopSimulation().catch((error) => {
    alert(`Error al cerrar: ${error.message}`);
  });
});

loadLeaderboard().catch(() => {});
updateKpis();
gameLoop();
