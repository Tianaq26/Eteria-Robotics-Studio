// ======================================================
// viewport3d.js — Visor 3D del editor de pintura. Carga el GLB una sola vez,
// clona los materiales de las 5 piezas pintables y les asigna la textura de
// canvasStore.js correspondiente. Pintar = raycast → UV → pixel del canvas
// de la pieza tocada (vía strokeEngine.js).
// ======================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PART_IDS, SKIN } from './parts.js';
import { getPart } from './canvasStore.js';
import { strokeStart, strokeMove, strokeEnd } from './strokeEngine.js';
import { state as paintState } from './paintState.js';

const GLB_URL = './modelos3D/sumobot.glb';

let renderer, scene, camera, controls, raycaster, viewer, model;
let rafId = null;
let maxXZ = 10;
const meshesByPart = new Map(); // partId -> THREE.Mesh[]
let allMeshes = [];
let cursorRing, cursorInner;
let lastHit = null;
let lastScreenRadiusPx = 40;
let onReadyCb = null;

function assignPartTexture(node, partId) {
  const entry = getPart(partId);
  if (!entry) return;
  node.material = node.material.clone();
  node.material.map = entry.texture;
  node.material.color.setRGB(1, 1, 1);
  node.material.skinning = false;
  node.material.needsUpdate = true;
  const arr = meshesByPart.get(partId) || [];
  arr.push(node);
  meshesByPart.set(partId, arr);
  allMeshes.push(node);
}

/**
 * THREE.Mesh.raycast() (heredado por SkinnedMesh) prueba la intersección
 * contra la geometría en bind-pose usando SOLO `matrixWorld` — NUNCA aplica
 * la matriz de skinning. Estos paneles son rígidos (no se animan, solo se
 * "sueldan" al armature vía skin para heredar su transform correctamente),
 * así que la pose skinneada es constante: la "horneamos" una vez a una
 * malla estática normal aplicando a mano la fórmula de skinning (bindMatrix →
 * combinación por hueso/peso → bindMatrixInverse) para que el raycast
 * coincida exactamente con lo que se renderiza. Sin esto, el hitbox de clic
 * queda desalineado (rotado/desplazado) de la superficie visible.
 *
 * NOTA: `SkinnedMesh.applyBoneTransform()` (la API pública de Three.js
 * pensada para esto) da resultados degenerados (colapsa todo a ~0,0,0) con
 * los datos de bind de este .glb en particular — probablemente por cómo
 * quedaron `bindMatrix`/`bindMatrixInverse` tras el parcheo del bug de
 * `skin` faltante (ver memoria del proyecto). La misma fórmula aplicada a
 * mano aquí sí da resultados correctos (verificado comparando el bounding
 * box resultante contra el del cuerpo del robot), así que se usa esta en
 * vez de la función nativa.
 */
function bakeSkinnedMeshToStatic(skinnedMesh) {
  skinnedMesh.skeleton.update();
  const geo = skinnedMesh.geometry.clone();
  const pos = geo.attributes.position;
  const skinIndexAttr = geo.attributes.skinIndex, skinWeightAttr = geo.attributes.skinWeight;
  const { bones, boneInverses } = skinnedMesh.skeleton;
  const base = new THREE.Vector3(), contrib = new THREE.Vector3(), boneMat = new THREE.Matrix4();
  for (let i = 0; i < pos.count; i++) {
    base.fromBufferAttribute(pos, i).applyMatrix4(skinnedMesh.bindMatrix);
    let sx = 0, sy = 0, sz = 0;
    for (let k = 0; k < 4; k++) {
      const weight = skinWeightAttr.getComponent(i, k);
      if (weight === 0) continue;
      const boneIndex = skinIndexAttr.getComponent(i, k);
      boneMat.multiplyMatrices(bones[boneIndex].matrixWorld, boneInverses[boneIndex]);
      contrib.copy(base).applyMatrix4(boneMat);
      sx += contrib.x * weight; sy += contrib.y * weight; sz += contrib.z * weight;
    }
    contrib.set(sx, sy, sz).applyMatrix4(skinnedMesh.bindMatrixInverse);
    pos.setXYZ(i, contrib.x, contrib.y, contrib.z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  // El bounding sphere/box quedó calculado para las posiciones ANTERIORES al
  // horneado — Mesh.raycast() lo usa como descarte rápido antes de probar
  // triángulos, así que si no se recalcula el raycast falla siempre.
  geo.boundingSphere = null;
  geo.boundingBox = null;
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  geo.deleteAttribute('skinIndex');
  geo.deleteAttribute('skinWeight');

  const staticMesh = new THREE.Mesh(geo, skinnedMesh.material);
  staticMesh.position.copy(skinnedMesh.position);
  staticMesh.quaternion.copy(skinnedMesh.quaternion);
  staticMesh.scale.copy(skinnedMesh.scale);
  staticMesh.name = skinnedMesh.name;
  skinnedMesh.parent.add(staticMesh);
  skinnedMesh.parent.remove(skinnedMesh);
  return staticMesh;
}

function loadModel() {
  const loader = new GLTFLoader();
  loader.load(GLB_URL, (gltf) => {
    model = gltf.scene;
    model.updateWorldMatrix(false, true);
    { const b0 = new THREE.Box3().setFromObject(model); const s0 = new THREE.Vector3(); b0.getSize(s0);
      if (Math.max(s0.x, s0.z) < 1) model.scale.setScalar(100); }

    model.traverse((n) => { if (n.isLight) n.intensity = 0; });
    model.updateMatrixWorld(true); // asegura matrices de huesos correctas antes de hornear el skin

    // Cada pieza es un nodo con ese nombre exacto; si el nodo tiene varias
    // primitivas (p. ej. "robot_base"), GLTFLoader lo carga como un Group y
    // las mallas reales quedan como hijos con OTRO nombre (p. ej. "Plane003",
    // "Plane003_1", ...) — por eso buscamos por nombre y luego recorremos
    // todos los descendientes-mesh de ese nodo, en vez de comparar nombres.
    for (const partId of PART_IDS) {
      const owner = model.getObjectByName(partId);
      if (!owner) continue;
      // Snapshot de hijos ANTES de tocar nada: bakeSkinnedMeshToStatic() reemplaza
      // el nodo en su padre (remove+add), lo que rompería un traverse() en vivo.
      const children = [];
      owner.traverse((child) => { if (child.isMesh && child.material && !Array.isArray(child.material)) children.push(child); });
      for (let child of children) {
        if (child.isSkinnedMesh) child = bakeSkinnedMeshToStatic(child);
        assignPartTexture(child, partId);
      }
    }

    model.updateWorldMatrix(false, true);
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3(); box.getSize(size);
    const ctr = new THREE.Vector3(); box.getCenter(ctr);
    model.position.x -= ctr.x; model.position.z -= ctr.z; model.position.y -= box.min.y;
    scene.add(model);

    maxXZ = Math.max(size.x, size.z);
    const cy = size.y * 0.45;
    camera.position.set(maxXZ * 0.9, size.y * 1.7, maxXZ * 1.5);
    controls.target.set(0, cy, 0);
    controls.update();
    resize();

    const missing = PART_IDS.filter((id) => !meshesByPart.has(id));
    if (missing.length) console.warn('viewport3d: piezas no encontradas en el GLB:', missing);
    if (onReadyCb) onReadyCb();
  }, undefined, (err) => console.warn('viewport3d: no cargó el GLB', err));
}

function makeCursorRing() {
  const group = new THREE.Group();
  const mkRing = (inner, outer, mColor, opacity) => {
    const geo = new THREE.RingGeometry(inner, outer, 48);
    const mat = new THREE.MeshBasicMaterial({
      color: mColor, transparent: true, opacity, side: THREE.DoubleSide,
      depthTest: false, depthWrite: false,
    });
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = 999;
    return m;
  };
  const outer = mkRing(0.86, 1.0, 0x000000, 0.55);
  const inner = mkRing(0.90, 0.97, 0xffffff, 0.95);
  group.add(outer, inner);
  group.visible = false;
  cursorInner = inner;
  return group;
}

function computeWorldRadius(hit, uvRadius) {
  const geo = hit.object.geometry;
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  const { a, b, c } = hit.face;
  const pA = new THREE.Vector3().fromBufferAttribute(pos, a).applyMatrix4(hit.object.matrixWorld);
  const pB = new THREE.Vector3().fromBufferAttribute(pos, b).applyMatrix4(hit.object.matrixWorld);
  const pC = new THREE.Vector3().fromBufferAttribute(pos, c).applyMatrix4(hit.object.matrixWorld);
  const uvA = new THREE.Vector2().fromBufferAttribute(uv, a);
  const uvB = new THREE.Vector2().fromBufferAttribute(uv, b);
  const uvC = new THREE.Vector2().fromBufferAttribute(uv, c);
  const e1 = pB.clone().sub(pA), e2 = pC.clone().sub(pA);
  const d1 = uvB.clone().sub(uvA), d2 = uvC.clone().sub(uvA);
  const det = d1.x * d2.y - d2.x * d1.y;
  if (Math.abs(det) < 1e-9) return uvRadius * maxXZ;
  const r = 1 / det;
  const tangent   = e1.clone().multiplyScalar(d2.y).sub(e2.clone().multiplyScalar(d1.y)).multiplyScalar(r);
  const bitangent = e2.clone().multiplyScalar(d1.x).sub(e1.clone().multiplyScalar(d2.x)).multiplyScalar(r);
  return uvRadius * (tangent.length() + bitangent.length()) / 2;
}

function screenRadiusFromHit(hit, worldRadius) {
  const rect = renderer.domElement.getBoundingClientRect();
  const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
  let tangent = new THREE.Vector3(1, 0, 0).cross(normal);
  if (tangent.lengthSq() < 1e-6) tangent = new THREE.Vector3(0, 1, 0).cross(normal);
  tangent.normalize();
  const edgePoint = hit.point.clone().addScaledVector(tangent, worldRadius);
  const c = hit.point.clone().project(camera);
  const e = edgePoint.clone().project(camera);
  const dx = (e.x - c.x) * 0.5 * rect.width;
  const dy = (e.y - c.y) * 0.5 * rect.height;
  return Math.max(4, Math.hypot(dx, dy));
}

function updateCursorRing(hit) {
  if (!cursorRing) return;
  if (!hit) { cursorRing.visible = false; return; }
  cursorRing.visible = true;
  const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
  cursorRing.position.copy(hit.point).addScaledVector(normal, 0.06);
  cursorRing.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);

  const sizeToolset = ['bucket', 'eyedrop', 'shapeRect', 'shapeCircle'].includes(paintState.tool);
  const worldRadius = sizeToolset
    ? maxXZ * 0.02
    : computeWorldRadius(hit, (paintState.size / 2) / SKIN);
  cursorRing.scale.setScalar(Math.max(worldRadius, 0.05));
  if (!sizeToolset) lastScreenRadiusPx = screenRadiusFromHit(hit, worldRadius);

  const tint = paintState.tool === 'eraser' ? 0xffffff
    : paintState.tool === 'eyedrop' ? 0x9aa0b5
    : new THREE.Color(paintState.color).getHex();
  cursorInner.material.color.setHex(tint);
}

function castAt(sx, sy, rect) {
  const ndc = new THREE.Vector2(((sx - rect.left) / rect.width) * 2 - 1, -((sy - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(allMeshes, false);
  return (hits.length && hits[0].uv) ? hits[0] : null;
}

function castNearMiss(ev, rect) {
  const dirs = 10;
  for (const frac of [1, 0.6]) {
    const r = lastScreenRadiusPx * frac;
    for (let i = 0; i < dirs; i++) {
      const ang = (i / dirs) * Math.PI * 2;
      const hit = castAt(ev.clientX + Math.cos(ang) * r, ev.clientY + Math.sin(ang) * r, rect);
      if (hit) return hit;
    }
  }
  return null;
}

function raycastHit(ev) {
  if (!allMeshes.length) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  scene.updateMatrixWorld(true);
  const hit = castAt(ev.clientX, ev.clientY, rect);
  return hit || castNearMiss(ev, rect);
}

function partIdForMesh(mesh) {
  for (const [id, arr] of meshesByPart) if (arr.includes(mesh)) return id;
  return null;
}

function uvToPx(uv) {
  return { x: uv.x * SKIN, y: (1 - uv.y) * SKIN };
}

function onPointerDown(ev) {
  if (ev.button !== 0) return;
  const hit = raycastHit(ev);
  if (!hit) return;
  ev.preventDefault();
  const partId = partIdForMesh(hit.object);
  if (!partId) return;
  strokeStart(partId, uvToPx(hit.uv));
  renderer.domElement.setPointerCapture(ev.pointerId);
}
function onPointerMove(ev) {
  const hit = raycastHit(ev);
  lastHit = hit;
  updateCursorRing(hit);
  if (!hit) return;
  const partId = partIdForMesh(hit.object);
  if (partId) strokeMove(partId, uvToPx(hit.uv));
}
function onPointerUp(ev) {
  strokeEnd();
  try { renderer.domElement.releasePointerCapture(ev.pointerId); } catch (_) {}
}
function onPointerLeave() {
  lastHit = null;
  updateCursorRing(null);
}

function resize() {
  if (!renderer || !viewer) return;
  const w = viewer.clientWidth || 600, h = viewer.clientHeight || 480;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function loop() {
  rafId = requestAnimationFrame(loop);
  controls.update();
  renderer.render(scene, camera);
}

export function initViewport3d(container, opts = {}) {
  onReadyCb = opts.onReady || null;
  viewer = container;
  const w = container.clientWidth || 600, h = container.clientHeight || 480;

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h, false);
  container.appendChild(renderer.domElement);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.touchAction = 'none';
  renderer.domElement.style.cursor = 'crosshair';

  scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const dir = new THREE.DirectionalLight(0xffffff, 1.0);
  dir.position.set(30, 60, 40);
  scene.add(dir);
  const dir2 = new THREE.DirectionalLight(0xffffff, 0.4);
  dir2.position.set(-40, 30, -30);
  scene.add(dir2);

  camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 2000);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  // Navegación estilo Blender: rueda = zoom, botón central = pan, clic derecho = orbitar.
  // Clic izquierdo queda libre para pintar.
  controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };

  raycaster = new THREE.Raycaster();
  cursorRing = makeCursorRing();
  scene.add(cursorRing);

  const dom = renderer.domElement;
  dom.addEventListener('pointerdown', onPointerDown);
  dom.addEventListener('pointermove', onPointerMove);
  dom.addEventListener('pointerleave', onPointerLeave);
  window.addEventListener('pointerup', onPointerUp);

  loadModel();
}

export function startViewport3d() {
  requestAnimationFrame(() => { resize(); if (!rafId) loop(); });
}
export function stopViewport3d() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
}
export function resizeViewport3d() { resize(); }
export function refreshCursor() { updateCursorRing(lastHit); }
