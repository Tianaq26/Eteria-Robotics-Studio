// ============================================================
// stadium.js — Genera el estadio procedural y los datos de asientos
// Cada asiento tiene una posición real en el mundo 3D, que luego
// se usa para colocar la cámara "sentada" en él.
// ============================================================
import * as THREE from "three";

// --- Dimensiones base (metros) ---
export const PITCH_L = 105;
export const PITCH_W = 68;

const ROW_DEPTH = 0.85;   // profundidad de cada fila
const ROW_RISE = 0.45;    // subida de cada fila (rake)
const SEAT_SPACING = 0.55;
const EYE_HEIGHT = 1.15;  // altura de ojos sentado sobre la grada

// --- Configuración de tribunas ---
// gap: distancia de la 1ª fila al borde de la cancha
const STANDS = [
  { id: "oeste", label: "Tribuna Oeste (Platea)", axis: "x", side: -1, gap: 8,  rows: 22, tier: "platea",    price: 15000, color: 0x3f6ea8 },
  { id: "este",  label: "Tribuna Este",           axis: "x", side: 1,  gap: 8,  rows: 20, tier: "general",   price: 9000,  color: 0x3d8f6b },
  { id: "norte", label: "Gradería Norte",         axis: "z", side: -1, gap: 10, rows: 16, tier: "populares", price: 6000,  color: 0xa8743f },
  { id: "sur",   label: "Gradería Sur",           axis: "z", side: 1,  gap: 10, rows: 16, tier: "populares", price: 6000,  color: 0xa8743f },
];

const SECTIONS_PER_STAND = 5;

export function formatCRC(n) {
  return "₡" + n.toLocaleString("es-CR");
}

// ------------------------------------------------------------
// Construye todo. Devuelve { group, seats, sections, seatMesh }
// ------------------------------------------------------------
export function buildStadium() {
  const group = new THREE.Group();
  const seats = [];      // { id, standId, sectionId, row, num, pos, lookYaw, taken }
  const sections = [];   // { id, standId, label, price, center, hitbox }

  group.add(buildPitch());
  group.add(buildGroundApron());

  for (const stand of STANDS) {
    buildStand(stand, group, seats, sections);
  }

  const seatMesh = buildSeatInstances(seats, group);
  addFloodlights(group);

  return { group, seats, sections, seatMesh };
}

// ------------------------------------------------------------
// Cancha con franjas de césped y líneas
// ------------------------------------------------------------
function buildPitch() {
  const g = new THREE.Group();

  // franjas alternadas
  const stripes = 12;
  const stripeW = PITCH_L / stripes;
  for (let i = 0; i < stripes; i++) {
    const geo = new THREE.PlaneGeometry(stripeW, PITCH_W);
    const mat = new THREE.MeshLambertMaterial({
      color: i % 2 === 0 ? 0x2e8b52 : 0x277947,
    });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(-PITCH_L / 2 + stripeW * (i + 0.5), 0.01, 0);
    m.receiveShadow = true;
    g.add(m);
  }

  // líneas blancas
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf0f4f8 });
  const line = (w, h, x, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), lineMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.02, z);
    g.add(m);
  };
  const LW = 0.3;
  line(PITCH_L, LW, 0, -PITCH_W / 2);          // banda norte
  line(PITCH_L, LW, 0, PITCH_W / 2);           // banda sur
  line(LW, PITCH_W, -PITCH_L / 2, 0);          // fondo oeste
  line(LW, PITCH_W, PITCH_L / 2, 0);           // fondo este
  line(LW, PITCH_W, 0, 0);                     // media cancha
  // áreas grandes
  line(16.5, LW, -PITCH_L / 2 + 8.25, -20.15);
  line(16.5, LW, -PITCH_L / 2 + 8.25, 20.15);
  line(LW, 40.3, -PITCH_L / 2 + 16.5, 0);
  line(16.5, LW, PITCH_L / 2 - 8.25, -20.15);
  line(16.5, LW, PITCH_L / 2 - 8.25, 20.15);
  line(LW, 40.3, PITCH_L / 2 - 16.5, 0);

  // círculo central
  const circle = new THREE.Mesh(
    new THREE.RingGeometry(9.0, 9.3, 64),
    lineMat
  );
  circle.rotation.x = -Math.PI / 2;
  circle.position.y = 0.02;
  g.add(circle);

  // porterías (simples)
  const goalMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const side of [-1, 1]) {
    const goal = new THREE.Group();
    const postGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.44, 8);
    const barGeo = new THREE.CylinderGeometry(0.08, 0.08, 7.32, 8);
    const p1 = new THREE.Mesh(postGeo, goalMat);
    p1.position.set(0, 1.22, -3.66);
    const p2 = p1.clone();
    p2.position.z = 3.66;
    const bar = new THREE.Mesh(barGeo, goalMat);
    bar.rotation.x = Math.PI / 2;
    bar.position.y = 2.44;
    goal.add(p1, p2, bar);
    goal.position.x = side * PITCH_L / 2;
    g.add(goal);
  }

  return g;
}

function buildGroundApron() {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(PITCH_L + 60, PITCH_W + 60),
    new THREE.MeshLambertMaterial({ color: 0x18202f })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = -0.02;
  m.receiveShadow = true;
  return m;
}

// ------------------------------------------------------------
// Una tribuna: terrazas de concreto + techo + datos de asientos
// ------------------------------------------------------------
function buildStand(stand, group, seats, sections) {
  const along = stand.axis === "x" ? PITCH_W + 6 : PITCH_L * 0.62; // largo de la tribuna
  const startEdge = stand.axis === "x" ? PITCH_L / 2 : PITCH_W / 2;
  const base = startEdge + stand.gap;

  const concrete = new THREE.MeshLambertMaterial({ color: 0x2a3448 });
  const concreteDark = new THREE.MeshLambertMaterial({ color: 0x222b3d });

  // --- terrazas (una caja larga por fila) ---
  for (let r = 0; r < stand.rows; r++) {
    const d = base + r * ROW_DEPTH;
    const h = 1.2 + r * ROW_RISE;
    const step = new THREE.Mesh(
      new THREE.BoxGeometry(
        stand.axis === "x" ? ROW_DEPTH : along,
        h,
        stand.axis === "x" ? along : ROW_DEPTH
      ),
      r % 2 ? concrete : concreteDark
    );
    const off = (d + ROW_DEPTH / 2) * stand.side;
    if (stand.axis === "x") step.position.set(off, h / 2, 0);
    else step.position.set(0, h / 2, off);
    step.castShadow = step.receiveShadow = true;
    group.add(step);
  }

  // --- muro frontal bajo ---
  const wallH = 1.4;
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(
      stand.axis === "x" ? 0.3 : along,
      wallH,
      stand.axis === "x" ? along : 0.3
    ),
    new THREE.MeshLambertMaterial({ color: 0x33415e })
  );
  const wallOff = (base - 0.3) * stand.side;
  if (stand.axis === "x") wall.position.set(wallOff, wallH / 2, 0);
  else wall.position.set(0, wallH / 2, wallOff);
  group.add(wall);

  // --- techo (solo tribunas laterales, como estadios ticos) ---
  if (stand.tier !== "populares") {
    const roofDepth = stand.rows * ROW_DEPTH + 6;
    const roofH = 1.2 + stand.rows * ROW_RISE + 5;
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(
        stand.axis === "x" ? roofDepth : along + 4,
        0.5,
        stand.axis === "x" ? along + 4 : roofDepth
      ),
      new THREE.MeshLambertMaterial({ color: 0x1b2333 })
    );
    const roofOff = (base + roofDepth / 2 - 2) * stand.side;
    if (stand.axis === "x") roof.position.set(roofOff, roofH, 0);
    else roof.position.set(0, roofH, roofOff);
    roof.rotation[stand.axis === "x" ? "z" : "x"] = 0.1 * -stand.side * (stand.axis === "x" ? 1 : -1);
    roof.castShadow = true;
    group.add(roof);

    // columnas traseras
    const colGeo = new THREE.CylinderGeometry(0.35, 0.35, roofH, 10);
    const colMat = new THREE.MeshLambertMaterial({ color: 0x33415e });
    const backOff = (base + stand.rows * ROW_DEPTH + 2.5) * stand.side;
    for (let i = -2; i <= 2; i++) {
      const col = new THREE.Mesh(colGeo, colMat);
      const t = (i / 2) * (along / 2 - 4);
      if (stand.axis === "x") col.position.set(backOff, roofH / 2, t);
      else col.position.set(t, roofH / 2, backOff);
      group.add(col);
    }
  }

  // --- datos de asientos + secciones ---
  const seatsPerRow = Math.floor(along / SEAT_SPACING) - 2;
  const perSection = Math.floor(seatsPerRow / SECTIONS_PER_STAND);
  const prefix = stand.id.charAt(0).toUpperCase();

  for (let s = 0; s < SECTIONS_PER_STAND; s++) {
    const sectionId = `${prefix}${s + 1}`;
    const secSeats = [];

    for (let r = 0; r < stand.rows; r++) {
      const d = base + r * ROW_DEPTH + ROW_DEPTH * 0.5;
      const y = 1.2 + r * ROW_RISE + 0.25; // asiento sobre la terraza

      for (let n = 0; n < perSection; n++) {
        const globalIdx = s * perSection + n;
        const t = (globalIdx - (perSection * SECTIONS_PER_STAND - 1) / 2) * SEAT_SPACING;
        const pos = new THREE.Vector3();
        if (stand.axis === "x") pos.set(d * stand.side, y, t);
        else pos.set(t, y, d * stand.side);

        // yaw mirando hacia la cancha (centro)
        const lookYaw = Math.atan2(-pos.x, -pos.z);

        const seat = {
          id: `${sectionId}-F${r + 1}-${n + 1}`,
          standId: stand.id,
          sectionId,
          row: r + 1,
          num: n + 1,
          pos,
          lookYaw,
          taken: pseudoRandom(sectionId, r, n) < occupancy(stand.tier),
        };
        seats.push(seat);
        secSeats.push(seat);
      }
    }

    // hitbox invisible para clic de sección
    const center = secSeats
      .reduce((acc, s2) => acc.add(s2.pos), new THREE.Vector3())
      .multiplyScalar(1 / secSeats.length);

    const hbW = perSection * SEAT_SPACING;
    const hbD = stand.rows * ROW_DEPTH;
    const hbH = stand.rows * ROW_RISE + 2;
    const hitbox = new THREE.Mesh(
      new THREE.BoxGeometry(
        stand.axis === "x" ? hbD : hbW,
        hbH,
        stand.axis === "x" ? hbW : hbD
      ),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hitbox.position.copy(center);
    hitbox.userData.sectionId = sectionId;
    group.add(hitbox);

    sections.push({
      id: sectionId,
      standId: stand.id,
      standLabel: stand.label,
      price: stand.price,
      rows: stand.rows,
      seatsPerRow: perSection,
      center,
      hitbox,
      color: stand.color,
    });
  }
}

function occupancy(tier) {
  return tier === "platea" ? 0.35 : tier === "general" ? 0.25 : 0.18;
}

// determinista para que la demo siempre se vea igual
function pseudoRandom(sec, r, n) {
  let h = 0;
  const str = `${sec}${r * 31}${n * 7}`;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(Math.sin(h)) % 1;
}

// ------------------------------------------------------------
// Asientos con InstancedMesh (miles de asientos, un draw call)
// ------------------------------------------------------------
function buildSeatInstances(seats, group) {
  const geo = new THREE.BoxGeometry(0.42, 0.4, 0.42);
  const mat = new THREE.MeshLambertMaterial();
  const mesh = new THREE.InstancedMesh(geo, mat, seats.length);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  const standColor = {};
  for (const s of STANDS) standColor[s.id] = s.color;

  seats.forEach((seat, i) => {
    dummy.position.copy(seat.pos);
    dummy.rotation.y = seat.lookYaw;
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    color.setHex(seat.taken ? 0x1c2536 : standColor[seat.standId]);
    mesh.setColorAt(i, color);
    seat.instanceId = i;
  });

  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = true;
  group.add(mesh);
  return mesh;
}

// ------------------------------------------------------------
// Torres de iluminación (ambiente de partido nocturno)
// ------------------------------------------------------------
function addFloodlights(group) {
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2c3852 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xf5f9ff });

  const corners = [
    [-PITCH_L / 2 - 22, -PITCH_W / 2 - 22],
    [PITCH_L / 2 + 22, -PITCH_W / 2 - 22],
    [-PITCH_L / 2 - 22, PITCH_W / 2 + 22],
    [PITCH_L / 2 + 22, PITCH_W / 2 + 22],
  ];

  for (const [x, z] of corners) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 32, 10), poleMat);
    pole.position.set(x, 16, z);
    group.add(pole);

    const head = new THREE.Mesh(new THREE.BoxGeometry(6, 3.4, 0.8), lampMat);
    head.position.set(x, 33, z);
    head.lookAt(0, 0, 0);
    group.add(head);

    const spot = new THREE.SpotLight(0xf2f7ff, 900, 260, Math.PI / 5, 0.5, 1.4);
    spot.position.set(x, 33, z);
    spot.target.position.set(0, 0, 0);
    group.add(spot, spot.target);
  }
}
