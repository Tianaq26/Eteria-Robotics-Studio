// ======================================================
// scene.js — Render 3D del dojo y los robots (Three.js).
// SOLO lectura: dibuja a partir del estado del núcleo, nunca lo modifica.
// Unidades = cm. Mundo físico (+x, +y arriba) -> Three (x, z=-y), Y = altura.
// ======================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RULES, ROBOT } from '../shared/config.js';
import { PART_IDS } from '../app/paint/parts.js';

const COLOR_A  = 0x3c82f0;
const COLOR_B  = 0xf05046;
const COLOR_OUT = 0x555566;

/** onBotSize(colRadius) se llama una vez cuando el GLB carga y el radio real se conoce. */
export function createScene(canvas, onBotSize) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14141a);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
  camera.position.set(0, 78, 86);
  camera.lookAt(0, 0, 0);

  // Controles de órbita: clic izq. o rueda del mouse (tipo Blender) = rotar, rueda = zoom, clic derecho = pan
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed   = 0.7;
  controls.zoomSpeed     = 0.9;
  controls.minDistance   = 25;
  controls.maxDistance   = 220;
  controls.maxPolarAngle = Math.PI / 2 - 0.05; // no pasar bajo el suelo
  controls.mouseButtons  = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };
  controls.update();

  scene.add(new THREE.AmbientLight(0xffffff, 0.65));
  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(40, 90, 30);
  scene.add(dir);

  // Piso externo
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(RULES.ARENA_HALF * 2, RULES.ARENA_HALF * 2),
    new THREE.MeshStandardMaterial({ color: 0x0a0a0c })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.2;
  scene.add(floor);

  // Dojo
  const dojo = new THREE.Mesh(
    new THREE.CylinderGeometry(RULES.DOJO_R_EXT, RULES.DOJO_R_EXT, 2, 64),
    new THREE.MeshStandardMaterial({ color: 0x111118 })
  );
  dojo.position.y = -0.5;
  scene.add(dojo);

  // Borde blanco
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(RULES.DOJO_R_INT, RULES.DOJO_R_EXT, 64),
    new THREE.MeshStandardMaterial({ color: 0xf2f2f2, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.55;
  scene.add(ring);

  // ── helpers ──────────────────────────────────────────

  // Texturas radiales para el LED. `stops` define el perfil de brillo.
  function makeRadialTexture(stops) {
    const s = 128;
    const cv = document.createElement('canvas');
    cv.width = cv.height = s;
    const g = cv.getContext('2d');
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    for (const [pos, a] of stops) grad.addColorStop(pos, `rgba(255,255,255,${a})`);
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    const tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.LinearFilter;
    return tex;
  }
  // Núcleo: punto caliente pequeño y nítido.  Halo: bloom amplio y suave.
  const _coreTex = makeRadialTexture([
    [0.0, 1.0], [0.28, 0.95], [0.45, 0.4], [0.6, 0.0],
  ]);
  const _haloTex = makeRadialTexture([
    [0.0, 0.55], [0.25, 0.35], [0.55, 0.12], [1.0, 0.0],
  ]);

  // Caja de fallback mientras carga el GLB (con color de equipo)
  function makeBoxRobot(teamColor) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(ROBOT.SIZE, 6, ROBOT.SIZE),
      new THREE.MeshStandardMaterial({ color: teamColor })
    );
    body.position.y = 3;
    g.add(body);
    const nose = new THREE.Mesh(
      new THREE.BoxGeometry(3, 3, ROBOT.SIZE * 0.5),
      new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    nose.position.set(ROBOT.SIZE * 0.5, 5, 0);
    g.add(nose);
    return g;
  }

  // Disco de equipo en el suelo (se ve siempre bajo el modelo)
  function makeDisc(teamColor) {
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(ROBOT.SIZE * 0.65, 32),
      new THREE.MeshStandardMaterial({ color: teamColor, transparent: true, opacity: 0.7 })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.6; // justo sobre la superficie del dojo
    return disc;
  }

  // ── robots ───────────────────────────────────────────

  function makeRobotEntry(teamColor) {
    const outer = new THREE.Group();
    const disc   = makeDisc(teamColor);
    const box    = makeBoxRobot(teamColor);
    outer.add(disc);
    outer.add(box);
    scene.add(outer);
    return { outer, disc, fallbackBox: box, discMat: disc.material, teamColor, glbLoaded: false,
             ledLight: null, ledMesh: null, ledGlow: null, ledCore: null,
             partMats: new Map() }; // partId -> THREE.Material[] (solo robot A tiene diseño pintable)
  }

  const robots = {
    A: makeRobotEntry(COLOR_A),
    B: makeRobotEntry(COLOR_B),
  };

  // ── carga GLB ────────────────────────────────────────

  const loader = new GLTFLoader();
  let sizeNotified = false;

  // ── Diseño pintado por el usuario (5 piezas independientes) ──
  // Los canvases viven en src/app/paint/canvasStore.js; aquí solo los mostramos
  // sobre los materiales de cada pieza del robot A. flipY ajustable si sale invertido.
  let _pendingParts = null;         // { partId: canvas } guardado hasta que el GLB de A carga
  const _partTextures = new Map();  // partId -> THREE.CanvasTexture

  function applyDesign(parts) {
    _pendingParts = parts;
    if (!robots.A.partMats.size) return; // aún no cargó el GLB → se aplicará al cargar
    for (const [partId, canvas] of Object.entries(parts)) {
      if (!canvas) continue;
      let tex = _partTextures.get(partId);
      if (!tex) {
        tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.flipY = true;          // ← si el diseño sale al revés, poner false
        _partTextures.set(partId, tex);
      } else {
        tex.image = canvas;
      }
      tex.needsUpdate = true;
      const mats = robots.A.partMats.get(partId) || [];
      mats.forEach((mat) => { mat.map = tex; mat.color.setRGB(1, 1, 1); mat.needsUpdate = true; });
    }
  }
  // Refresca las texturas del combate tras pintar (mismos canvases, nuevos pixeles).
  function refreshDesign() { _partTextures.forEach((tex) => { tex.needsUpdate = true; }); }

  function loadGLB(key) {
    loader.load(
      './modelos3D/sumobot.glb',
      (gltf) => {
        const entry = robots[key];
        const model = gltf.scene;

        // ── 1. Escalar si el modelo está en metros ────────────────
        model.updateWorldMatrix(false, true);
        {
          const b0 = new THREE.Box3().setFromObject(model);
          const s0 = new THREE.Vector3(); b0.getSize(s0);
          if (Math.max(s0.x, s0.z) < 1) model.scale.setScalar(100);
        }

        // ── 2. Deshabilitar luces del GLB y capturar mesh "led" ──
        model.traverse(node => {
          if (node.isLight) node.intensity = 0;
          if (node.isMesh && node.name === 'led' && node.material) {
            node.material = node.material.clone();
            node.material.emissive         = new THREE.Color(0, 0, 0);
            node.material.emissiveIntensity = 0;
            node.material.toneMapped        = false; // emissive a brillo pleno
            entry.ledMesh = node;
          }
        });

        // Capturar las piezas pintables (solo robot A) por nombre de nodo. Si el
        // nodo tiene varias primitivas (p. ej. "robot_base"), GLTFLoader lo carga
        // como un Group y las mallas reales quedan como hijos con otro nombre
        // ("Plane003", "Plane003_1", ...) — por eso buscamos el nodo por nombre y
        // recorremos sus descendientes-mesh, en vez de comparar nombres directo.
        if (key === 'A') {
          for (const partId of PART_IDS) {
            const owner = model.getObjectByName(partId);
            if (!owner) continue;
            owner.traverse((node) => {
              if (!node.isMesh || !node.material || Array.isArray(node.material)) return;
              node.material = node.material.clone();
              const arr = entry.partMats.get(partId) || [];
              arr.push(node.material);
              entry.partMats.set(partId, arr);
            });
          }
        }

        // ── 3. Centrar en XZ y apoyar en Y = 0 ───────────────────
        model.updateWorldMatrix(false, true);
        const box3 = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        const ctr  = new THREE.Vector3();
        box3.getSize(size);
        box3.getCenter(ctr);
        model.position.x = -ctr.x;
        model.position.z = -ctr.z;
        model.position.y = -box3.min.y;

        // ── 5. Quitar caja fallback; añadir GLB ──────────────────
        if (entry.fallbackBox) entry.outer.remove(entry.fallbackBox);
        entry.outer.add(model);
        entry.glbLoaded = true;

        // Si ya había un diseño pendiente (guardado o recién pintado), aplicarlo.
        if (key === 'A' && _pendingParts) applyDesign(_pendingParts);

        // Apagar emissive del mesh "led" (está mal posicionado en el GLB,
        // no lo usamos para el brillo; el glow/luz van en posición fija).
        if (entry.ledMesh && entry.ledMesh.material) {
          entry.ledMesh.material.emissiveIntensity = 0;
        }

        // ── Posición MANUAL del LED (espacio del outer, escala 1 = cm) ──
        //   Ajusta estos 3 valores a mano hasta que quede sobre el LED real.
        //   X: +derecha / -izquierda · Y: altura · Z: +atrás / -adelante
        //   Son fracciones del tamaño del robot, fáciles de afinar.
        const LED_X = size.x *  -0.055;   // centrado en X
        const LED_Y = size.y * 0.22;   // sobre la placa
        const LED_Z = size.z *  -0.015;   // centrado en Z
        const ledPos = new THREE.Vector3(LED_X, LED_Y, LED_Z);

        // ── 4. LED: PointLight en posición manual ────────────────
        const ledLight = new THREE.PointLight(0xffffff, 0, 8, 2);
        ledLight.position.copy(ledPos);
        entry.outer.add(ledLight);
        entry.ledLight = ledLight;

        // ── 6. LED de dos capas: núcleo caliente + halo de color ──
        const base = Math.max(size.x, size.z);
        // Halo: bloom amplio y suave (toma el color del LED)
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({
          map: _haloTex, color: 0xffffff, transparent: true,
          blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0,
        }));
        halo.scale.setScalar(base * 0.147);
        halo.position.copy(ledPos);
        halo.visible = false;
        entry.outer.add(halo);
        entry.ledGlow = halo;
        // Núcleo: punto pequeño e intenso, casi blanco
        const core = new THREE.Sprite(new THREE.SpriteMaterial({
          map: _coreTex, color: 0xffffff, transparent: true,
          blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0,
        }));
        core.scale.setScalar(base * 0.06);
        core.position.copy(ledPos);
        core.position.y += 0.01; // evitar z-fight con el halo
        core.visible = false;
        entry.outer.add(core);
        entry.ledCore = core;

        // ── Animación "Avanzar" ──────────────────────────────────
        if (gltf.animations && gltf.animations.length > 0) {
          const mixer  = new THREE.AnimationMixer(model);
          const clip   = THREE.AnimationClip.findByName(gltf.animations, 'Avanzar') || gltf.animations[0];
          const action = mixer.clipAction(clip);
          action.play(); action.paused = true;
          entry.mixer  = mixer;
          entry.action = action;
        }

        // ── Tamaño real → colisión + ajuste de overlays ──────────
        if (key === 'A' && !sizeNotified && onBotSize) {
          sizeNotified = true;
          // Usar la dimensión más pequeña de XZ para evitar que lados largos inflen la colisión
          const colRadius = (Math.min(size.x, size.z) / 2) * 0.88;
          if (colRadius > 1 && colRadius < 15) {
            onBotSize(colRadius);
            // irOff = offset frontal; los puntos laterales usan 60% de irOff
            // (igual que sensors.js para que visual y física coincidan)
            const irOff = Math.min(colRadius * 0.55, 4.5);
            ROBOT.IR_OFF = irOff;
            const irLat = irOff * 0.6;
            _irDots.forEach((mesh, i) => {
              const sx = i < 2 ? irLat : -irLat;   // lateral (X en Three.js)
              const sz = i % 2 === 0 ? -irOff : irOff; // frontal/trasero (Z)
              mesh.position.set(sx, 0.85, sz);
            });
          }
        }
      },
      undefined,
      (err) => console.warn('sumobot.glb no cargó, usando caja fallback:', err)
    );
  }

  loadGLB('A');
  loadGLB('B');

  // ── Overlays pedagógicos ─────────────────────────────

  // Sonar: fan de detección ultrasónica (±15°)
  const SONAR_R    = 55;
  const SONAR_SEGS = 20;
  const SONAR_HALF = 15 * Math.PI / 180;
  function makeSonarFan() {
    const verts = [0, 0.8, 0];
    for (let i = 0; i <= SONAR_SEGS; i++) {
      const a = -SONAR_HALF + (2 * SONAR_HALF * i / SONAR_SEGS);
      verts.push(Math.cos(a) * SONAR_R, 0.8, Math.sin(a) * SONAR_R);
    }
    const idx = [];
    for (let i = 0; i < SONAR_SEGS; i++) idx.push(0, i + 1, i + 2);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x3c82f0, transparent: true, opacity: 0.10,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    // arc outline
    const arcPts = [];
    for (let i = 0; i <= SONAR_SEGS; i++) {
      const a = -SONAR_HALF + (2 * SONAR_HALF * i / SONAR_SEGS);
      arcPts.push(new THREE.Vector3(Math.cos(a) * SONAR_R, 0.9, Math.sin(a) * SONAR_R));
    }
    const arcLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(arcPts),
      new THREE.LineBasicMaterial({ color: 0x3c82f0, transparent: true, opacity: 0.35 })
    );
    const g = new THREE.Group();
    g.add(mesh); g.add(arcLine);
    return { group: g, mat, arcMat: arcLine.material };
  }

  // IR: 4 discos en las esquinas del robot (se encienden con el borde blanco)
  // Convención Three local: +X = adelante, -Z = izquierda, +Z = derecha
  function makeIRDots() {
    const o = ROBOT.IR_OFF;
    const positions = [
      [+o, 0.85, -o],  // FL
      [+o, 0.85, +o],  // FR
      [-o, 0.85, -o],  // BL
      [-o, 0.85, +o],  // BR
    ];
    return positions.map(([x, y, z]) => {
      const mesh = new THREE.Mesh(
        new THREE.CircleGeometry(2.0, 10),
        new THREE.MeshBasicMaterial({
          color: 0x334455, transparent: true, opacity: 0.9,
          side: THREE.DoubleSide, depthWrite: false,
        })
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, y, z);
      return mesh;
    });
  }

  // Trail: línea de los últimos N ticks del robot A
  const TRAIL_MAX = 60;
  const _trailBuf  = new Float32Array(TRAIL_MAX * 3);
  const _trailGeo  = new THREE.BufferGeometry();
  _trailGeo.setAttribute('position', new THREE.BufferAttribute(_trailBuf, 3));
  _trailGeo.setDrawRange(0, 0);
  const _trailHistory = [];   // { x, z }[]
  const _trailLine = new THREE.Line(
    _trailGeo,
    new THREE.LineBasicMaterial({ color: 0x3c82f0, transparent: true, opacity: 0.40 })
  );
  scene.add(_trailLine);

  // Anillo de peligro: zona interior justo antes del borde blanco
  const _dangerRing = new THREE.Mesh(
    new THREE.RingGeometry(RULES.DOJO_R_INT - 7, RULES.DOJO_R_INT + 1, 80),
    new THREE.MeshBasicMaterial({
      color: 0xff5500, transparent: true, opacity: 0.0,
      side: THREE.DoubleSide, depthWrite: false,
    })
  );
  _dangerRing.rotation.x = -Math.PI / 2;
  _dangerRing.position.y = 0.63;
  scene.add(_dangerRing);

  // Montaje inicial de overlays en el outer del robot A
  const _sonar = makeSonarFan();
  robots.A.outer.add(_sonar.group);
  const _irDots = makeIRDots();
  _irDots.forEach(m => robots.A.outer.add(m));

  // Estado de overlays
  let _showOverlays = false;
  _sonar.group.visible = false;
  _irDots.forEach(m => { m.visible = false; });
  _trailLine.visible   = false;
  _dangerRing.visible  = false;

  let _dangerPulse = 0;

  function updateOverlays(state, dt) {
    const sA = state.sA;
    if (!sA) return;

    // ── Sonar cone ──────────────────────────────────
    const detected = sA.enemy.detected;
    const sonarColor = detected ? 0x22dd88 : 0x3c82f0;
    _sonar.mat.color.setHex(sonarColor);
    _sonar.arcMat.color.setHex(sonarColor);
    _sonar.mat.opacity    = detected ? 0.18 : 0.10;
    _sonar.arcMat.opacity = detected ? 0.70 : 0.35;

    // ── IR dots ──────────────────────────────────────
    const border = sA.border;
    const irStates = [border.frontLeft, border.frontRight, border.backLeft, border.backRight];
    _irDots.forEach((m, i) => {
      m.material.color.setHex(irStates[i] ? 0xfff0aa : 0x223344);
      m.material.opacity = irStates[i] ? 1.0 : 0.6;
    });

    // ── Trail ────────────────────────────────────────
    _trailHistory.push({ x: state.A.pos.x, z: -state.A.pos.y });
    if (_trailHistory.length > TRAIL_MAX) _trailHistory.shift();
    for (let i = 0; i < _trailHistory.length; i++) {
      _trailBuf[i * 3]     = _trailHistory[i].x;
      _trailBuf[i * 3 + 1] = 0.4;
      _trailBuf[i * 3 + 2] = _trailHistory[i].z;
    }
    _trailGeo.attributes.position.needsUpdate = true;
    _trailGeo.setDrawRange(0, _trailHistory.length);

    // ── Danger ring (pulsa cuando el borde está activo) ──
    if (border.any) {
      _dangerPulse = Math.min(1, _dangerPulse + dt * 6);
    } else {
      _dangerPulse = Math.max(0, _dangerPulse - dt * 3);
    }
    _dangerRing.material.opacity = _dangerPulse * 0.22;
  }

  // ── render ───────────────────────────────────────────

  let _lastNow = performance.now();

  function resize() {
    const w = canvas.clientWidth  || canvas.width;
    const h = canvas.clientHeight || canvas.height;
    if (canvas.width !== w || canvas.height !== h) renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function place(key, r) {
    const entry = robots[key];
    entry.outer.position.set(r.pos.x, 0, -r.pos.y);
    entry.outer.rotation.y = r.th;
    entry.discMat.color.setHex(r.out ? COLOR_OUT : entry.teamColor);
    entry.discMat.opacity = r.out ? 0.35 : 0.7;
  }

  function angleDelta(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function motorAnimSpeed(r) {
    const avg = (r.left + r.right) * 0.5;
    if (Math.abs(avg) > 0.05) return avg;
    const turn = (r.right - r.left) * 0.5;
    return Math.abs(turn) > 0.05 ? turn : 0;
  }

  function updateAnim(entry, r, dt) {
    if (!entry.mixer || !entry.action) return;

    if (dt <= 0 || r.out) {
      entry.animPrev = { x: r.pos.x, y: r.pos.y, th: r.th };
      entry.action.paused = true;
      return;
    }

    let animSpeed = 0;
    const prev = entry.animPrev;
    if (prev) {
      const dx = r.pos.x - prev.x;
      const dy = r.pos.y - prev.y;
      const dth = angleDelta(r.th, prev.th);
      const dist = Math.hypot(dx, dy);

      // Saltos grandes vienen de reinicios/cambios de ronda, no de movimiento fisico.
      if (dist < 30 && Math.abs(dth) < Math.PI * 0.75) {
        const midTh = prev.th + dth * 0.5;
        const forward = dx * Math.cos(midTh) + dy * Math.sin(midTh);
        const halfBase = ROBOT.WHEEL_BASE * 0.5;
        const leftTravel = forward - dth * halfBase;
        const rightTravel = forward + dth * halfBase;
        const wheelTravel = (Math.abs(leftTravel) + Math.abs(rightTravel)) * 0.5;
        const sign = Math.abs(forward) > 0.01
          ? Math.sign(forward)
          : Math.sign(dth || (r.right - r.left));
        animSpeed = sign * wheelTravel / Math.max(ROBOT.WHEEL_VMAX * dt, 1e-6);
      }
    }

    entry.animPrev = { x: r.pos.x, y: r.pos.y, th: r.th };

    // Si el robot esta empujando pero la pose casi no cambia, las ruedas siguen girando.
    const motorSpeed = motorAnimSpeed(r);
    if (Math.abs(animSpeed) < 0.05 && Math.abs(motorSpeed) > 0.05) animSpeed = motorSpeed;
    animSpeed = Math.max(-12, Math.min(12, animSpeed));

    const moving = Math.abs(animSpeed) > 0.05;
    entry.action.paused    = !moving;
    entry.action.timeScale = animSpeed; // negativo -> AnimationMixer reproduce al reves
    if (moving) entry.mixer.update(dt);
  }

  function setPixelColor(r, g, b) {
    const nr = r / 255, ng = g / 255, nb = b / 255;
    const brightness = Math.max(nr, ng, nb);
    const on = brightness > 0.01;

    // PointLight: zona muy pequeña (distance=8, decay=2), brillo reducido
    const light = robots.A.ledLight;
    if (light) {
      light.color.setRGB(nr, ng, nb);
      light.intensity = on ? brightness * 6 : 0;
    }

    // NOTA: el mesh "led" del GLB está mal posicionado (flota), por eso NO
    // tocamos su emissive aquí. El LED visible son los sprites halo + núcleo.

    // Halo: bloom amplio con el color puro del LED
    const halo = robots.A.ledGlow;
    if (halo) {
      halo.material.color.setRGB(nr, ng, nb);
      halo.material.opacity = on ? Math.min(1, 0.35 + brightness * 0.45) : 0;
      halo.visible = on;
    }
    // Núcleo: punto caliente, color mezclado hacia blanco (como un LED real)
    const core = robots.A.ledCore;
    if (core) {
      const wr = nr + (1 - nr) * 0.7;
      const wg = ng + (1 - ng) * 0.7;
      const wb = nb + (1 - nb) * 0.7;
      core.material.color.setRGB(wr, wg, wb);
      core.material.opacity = on ? Math.min(1, 0.6 + brightness * 0.4) : 0;
      core.visible = on;
    }
  }

  function setOverlays(visible) {
    _showOverlays = visible;
    _sonar.group.visible = visible;
    _irDots.forEach(m => { m.visible = visible; });
    _trailLine.visible  = visible;
    _dangerRing.visible = visible;
    if (!visible) {
      _trailHistory.length = 0;
      _trailGeo.setDrawRange(0, 0);
      _dangerPulse = 0;
    }
  }

  function render(state, paused, showOverlays = false) {
    const now = performance.now();
    const dt  = paused ? 0 : Math.min((now - _lastNow) / 1000, 0.1);
    _lastNow  = now;

    if (showOverlays !== _showOverlays) setOverlays(showOverlays);
    if (_showOverlays && !paused) updateOverlays(state, dt);

    resize();
    place('A', state.A);
    updateAnim(robots.A, state.A, dt);

    robots.B.outer.visible = !state.solo;
    if (!state.solo) {
      place('B', state.B);
      updateAnim(robots.B, state.B, dt);
    }

    controls.update();
    renderer.render(scene, camera);
  }

  return { render, setOverlays, setPixelColor, applyDesign, refreshDesign };
}
