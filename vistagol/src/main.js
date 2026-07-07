// ============================================================
// main.js — VistaGol MVP
// Flujo: vista general (orbit) → clic en sección → elegir asiento
// en el mapa → cámara vuela al asiento → mirada libre en 1ª persona.
// ============================================================
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildStadium, formatCRC, PITCH_L, PITCH_W } from "./stadium.js";

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const canvas = $("scene");
const landing = $("landing");
const topbar = $("topbar");
const hint = $("hint");
const btnReset = $("btn-reset");
const panel = $("panel");
const seatmapEl = $("seatmap");
const ticket = $("ticket");
const hud = $("seatview-hud");
const modal = $("modal");
const loader = $("loader");

// ---------- Estado ----------
const MODE = { OVERVIEW: 0, SEATVIEW: 1, TRANSITION: 2 };
let mode = MODE.OVERVIEW;
let currentSection = null;
let selectedSeat = null;

// ---------- Renderer / escena ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1220);
scene.fog = new THREE.Fog(0x0b1220, 220, 420);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 600);
camera.position.set(120, 95, 130);

// ---------- Luces ----------
scene.add(new THREE.HemisphereLight(0x8fa8cc, 0x0e1626, 0.75));
const moon = new THREE.DirectionalLight(0xbfd0ea, 0.7);
moon.position.set(-80, 120, 60);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
moon.shadow.camera.left = moon.shadow.camera.bottom = -140;
moon.shadow.camera.right = moon.shadow.camera.top = 140;
scene.add(moon);

// ---------- Estadio ----------
const { group: stadium, seats, sections, seatMesh } = buildStadium();
scene.add(stadium);

const seatById = new Map(seats.map((s) => [s.id, s]));
const sectionById = new Map(sections.map((s) => [s.id, s]));

// marcador del asiento seleccionado en 3D
const marker = new THREE.Mesh(
  new THREE.ConeGeometry(0.55, 1.3, 4),
  new THREE.MeshBasicMaterial({ color: 0xf2c14e })
);
marker.rotation.x = Math.PI;
marker.visible = false;
scene.add(marker);

// ---------- Controles (vista general) ----------
const orbit = new OrbitControls(camera, canvas);
orbit.target.set(0, 4, 0);
orbit.enableDamping = true;
orbit.dampingFactor = 0.06;
orbit.maxPolarAngle = Math.PI / 2.15;
orbit.minDistance = 40;
orbit.maxDistance = 260;

// ---------- Mirada en primera persona (asiento) ----------
const look = {
  active: false,
  yaw: 0,
  pitch: 0,
  baseYaw: 0,
  dragging: false,
  lastX: 0,
  lastY: 0,
  YAW_LIMIT: THREE.MathUtils.degToRad(110),
  PITCH_LIMIT: THREE.MathUtils.degToRad(42),
};

canvas.addEventListener("pointerdown", (e) => {
  if (mode !== MODE.SEATVIEW) return;
  look.dragging = true;
  look.lastX = e.clientX;
  look.lastY = e.clientY;
});
addEventListener("pointerup", () => (look.dragging = false));
addEventListener("pointermove", (e) => {
  if (mode !== MODE.SEATVIEW || !look.dragging) return;
  const dx = e.clientX - look.lastX;
  const dy = e.clientY - look.lastY;
  look.lastX = e.clientX;
  look.lastY = e.clientY;
  look.yaw = THREE.MathUtils.clamp(look.yaw - dx * 0.0032, -look.YAW_LIMIT, look.YAW_LIMIT);
  look.pitch = THREE.MathUtils.clamp(look.pitch - dy * 0.0028, -look.PITCH_LIMIT, look.PITCH_LIMIT);
});

function applyLook() {
  const yaw = look.baseYaw + look.yaw;
  const dir = new THREE.Vector3(
    Math.sin(yaw) * Math.cos(look.pitch),
    Math.sin(look.pitch),
    Math.cos(yaw) * Math.cos(look.pitch)
  );
  camera.lookAt(camera.position.clone().add(dir));
}

// ---------- Transición de cámara ----------
const flight = { active: false, t: 0, dur: 1.4, fromPos: new THREE.Vector3(), toPos: new THREE.Vector3(), fromTarget: new THREE.Vector3(), toTarget: new THREE.Vector3(), onDone: null };

function flyTo(pos, target, dur, onDone) {
  flight.active = true;
  flight.t = 0;
  flight.dur = dur;
  flight.fromPos.copy(camera.position);
  flight.toPos.copy(pos);
  flight.fromTarget.copy(orbit.target);
  flight.toTarget.copy(target);
  flight.onDone = onDone || null;
  mode = MODE.TRANSITION;
  orbit.enabled = false;
}

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// ---------- Raycast: clic en secciones ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downAt = null;

canvas.addEventListener("pointerdown", (e) => (downAt = [e.clientX, e.clientY]));
canvas.addEventListener("pointerup", (e) => {
  if (mode !== MODE.OVERVIEW || !downAt) return;
  const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
  downAt = null;
  if (moved > 6) return; // fue un drag, no un clic

  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(sections.map((s) => s.hitbox));
  if (hits.length) openSection(hits[0].object.userData.sectionId);
});

// ---------- UI: panel de sección ----------
function openSection(sectionId) {
  const sec = sectionById.get(sectionId);
  currentSection = sec;

  $("panel-stand").textContent = sec.standLabel;
  $("panel-section").textContent = `Sección ${sec.id}`;
  $("panel-price").textContent = formatCRC(sec.price);

  renderSeatmap(sec);
  panel.classList.remove("hidden");
  hint.textContent = "Elegí un asiento en el mapa para verlo en 3D";

  // acercar la cámara a la sección
  const dir = sec.center.clone().setY(0).normalize();
  const camPos = sec.center.clone().add(dir.multiplyScalar(38)).setY(sec.center.y + 26);
  flyTo(camPos, sec.center.clone().setY(4), 1.1, () => {
    mode = MODE.OVERVIEW;
    orbit.enabled = true;
    orbit.target.copy(sec.center).setY(4);
  });
}

function renderSeatmap(sec) {
  seatmapEl.innerHTML = "";
  seatmapEl.style.gridTemplateColumns = `28px repeat(${sec.seatsPerRow}, 17px)`;

  // fila 1 = más cerca de la cancha (arriba del mapa)
  for (let r = 1; r <= sec.rows; r++) {
    const label = document.createElement("div");
    label.className = "row-label";
    label.textContent = `F${r}`;
    seatmapEl.appendChild(label);

    for (let n = 1; n <= sec.seatsPerRow; n++) {
      const seat = seatById.get(`${sec.id}-F${r}-${n}`);
      const b = document.createElement("button");
      b.className = "seat-btn" + (seat.taken ? " taken" : "");
      b.title = seat.taken ? `${seat.id} · vendido` : seat.id;
      if (!seat.taken) {
        b.addEventListener("click", () => selectSeat(seat, b));
      } else {
        b.disabled = true;
      }
      seatmapEl.appendChild(b);
    }
  }
}

function selectSeat(seat, btn) {
  selectedSeat = seat;
  seatmapEl.querySelectorAll(".selected").forEach((el) => el.classList.remove("selected"));
  btn.classList.add("selected");

  marker.position.copy(seat.pos).add(new THREE.Vector3(0, 1.9, 0));
  marker.visible = true;

  $("ticket-code").textContent = seat.id;
  $("ticket-meta").textContent = `${currentSection.standLabel} · Fila ${seat.row} · Asiento ${seat.num}`;
  $("ticket-price").textContent = formatCRC(currentSection.price);
  ticket.classList.remove("hidden");
}

// ---------- Vista desde el asiento ----------
$("btn-view").addEventListener("click", () => {
  if (!selectedSeat) return;
  const eye = selectedSeat.pos.clone().add(new THREE.Vector3(0, 1.15, 0));
  const target = new THREE.Vector3(0, 1, 0); // centro de la cancha

  panel.classList.add("hidden");
  ticket.classList.add("hidden");
  marker.visible = false;

  flyTo(eye, target, 1.5, () => {
    mode = MODE.SEATVIEW;
    look.yaw = 0;
    look.pitch = 0;
    // yaw base: mirando al centro de la cancha
    const d = target.clone().sub(eye);
    look.baseYaw = Math.atan2(d.x, d.z);
    $("hud-code").textContent = selectedSeat.id;
    hud.classList.remove("hidden");
    btnReset.classList.remove("hidden");
    hint.textContent = "";
  });
});

// ---------- Volver a vista general ----------
btnReset.addEventListener("click", resetToOverview);

function resetToOverview() {
  hud.classList.add("hidden");
  btnReset.classList.add("hidden");
  const pos = new THREE.Vector3(120, 95, 130);
  const target = new THREE.Vector3(0, 4, 0);
  flyTo(pos, target, 1.3, () => {
    mode = MODE.OVERVIEW;
    orbit.enabled = true;
    orbit.target.copy(target);
    hint.textContent = "Hacé clic en una sección del estadio para ver los asientos";
    if (currentSection) {
      panel.classList.remove("hidden");
      if (selectedSeat) {
        ticket.classList.remove("hidden");
        marker.visible = true;
      }
    }
  });
}

// ---------- Compra demo ----------
$("btn-buy").addEventListener("click", () => {
  $("modal-seat").textContent =
    `${selectedSeat.id} · ${currentSection.standLabel} · ${formatCRC(currentSection.price)}`;
  modal.classList.remove("hidden");
});
$("btn-close-modal").addEventListener("click", () => modal.classList.add("hidden"));

// ---------- Landing ----------
$("btn-enter").addEventListener("click", () => {
  landing.classList.add("leaving");
  setTimeout(() => landing.classList.add("hidden"), 650);
  topbar.classList.remove("hidden");
  // pequeño vuelo de presentación
  flyTo(new THREE.Vector3(95, 70, 105), new THREE.Vector3(0, 4, 0), 1.6, () => {
    mode = MODE.OVERVIEW;
    orbit.enabled = true;
  });
});

// ---------- Resize ----------
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- Loop ----------
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();

  if (flight.active) {
    flight.t += dt / flight.dur;
    const k = easeInOut(Math.min(flight.t, 1));
    camera.position.lerpVectors(flight.fromPos, flight.toPos, k);
    const target = new THREE.Vector3().lerpVectors(flight.fromTarget, flight.toTarget, k);
    camera.lookAt(target);
    if (flight.t >= 1) {
      flight.active = false;
      flight.onDone && flight.onDone();
    }
  } else if (mode === MODE.SEATVIEW) {
    applyLook();
  } else if (mode === MODE.OVERVIEW) {
    orbit.update();
  }

  renderer.render(scene, camera);
}

animate();
loader.classList.add("done");
