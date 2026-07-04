// ======================================================
// fix-glb-skin.js — Corrige un bug de exportación de Blender: mallas
// pesadas al esqueleto (armature) que exportan SIN el campo `skin` en su
// nodo glTF. Three.js las carga entonces como mallas rígidas estáticas
// (posición/rotación cruda del nodo) en vez de deformarlas junto al
// chasis, y aparecen desplazadas/giradas.
//
// Reaparece cada vez que se re-exporta el .glb desde Blender si el objeto
// (p.ej. "tapa") no tiene aplicado el modifier de Armature. Mientras no se
// arregle en el .blend, correr este script después de cada export nuevo:
//
//   npm run fix:glb
//
// Uso: node tools/fix-glb-skin.js [ruta.glb] [nombre1 nombre2 ...]
// Por defecto: modelos3D/sumobot.glb, nodo "tapa".
// ======================================================
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';

const args = process.argv.slice(2);
const GLB_PATH = args[0] && !args[0].startsWith('-') ? args[0] : 'modelos3D/sumobot.glb';
const TARGET_NAMES = args.length > 1 ? args.slice(1) : ['tapa'];

const JSON_CHUNK = 0x4e4f534a; // 'JSON'

function readGlb(path) {
  const buf = readFileSync(path);
  const magic = buf.readUInt32LE(0);
  const version = buf.readUInt32LE(4);
  let offset = 12;
  const chunks = [];
  while (offset < buf.length) {
    const length = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    chunks.push({ type, data });
    offset += 8 + length;
  }
  return { magic, version, chunks };
}

function writeGlb(path, { magic, version, chunks }) {
  const chunkBuffers = chunks.map(c => {
    const header = Buffer.alloc(8);
    header.writeUInt32LE(c.data.length, 0);
    header.writeUInt32LE(c.type, 4);
    return Buffer.concat([header, c.data]);
  });
  const body = Buffer.concat(chunkBuffers);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(magic, 0);
  header.writeUInt32LE(version, 4);
  header.writeUInt32LE(12 + body.length, 8);
  writeFileSync(path, Buffer.concat([header, body]));
}

const glb = readGlb(GLB_PATH);
const jsonChunk = glb.chunks.find(c => c.type === JSON_CHUNK);
const json = JSON.parse(jsonChunk.data.toString('utf8'));

if (!json.skins || !json.skins.length) {
  console.error('No hay ningún "skin" (esqueleto) en el archivo. Nada que arreglar.');
  process.exit(1);
}
const skinIndex = 0; // un solo esqueleto (Armature.001) en este modelo

let fixedCount = 0;
for (const name of TARGET_NAMES) {
  const node = json.nodes.find(n => n.name === name);
  if (!node) {
    console.warn(`⚠ nodo "${name}" no encontrado, se omite.`);
    continue;
  }
  const mesh = json.meshes[node.mesh];
  const hasJoints = mesh && mesh.primitives.every(p => 'JOINTS_0' in p.attributes);
  if (!hasJoints) {
    console.warn(`⚠ nodo "${name}" no tiene atributos JOINTS_0/WEIGHTS_0, no se toca (no está pesado al esqueleto).`);
    continue;
  }
  if (node.skin === skinIndex && !node.translation && !node.rotation && !node.scale) {
    console.log(`✓ nodo "${name}" ya está correcto (skin:${skinIndex}, sin TRS propio).`);
    continue;
  }
  console.log(`Arreglando "${name}": antes = ${JSON.stringify(node)}`);
  delete node.translation;
  delete node.rotation;
  delete node.scale;
  node.skin = skinIndex;
  console.log(`             después = ${JSON.stringify(node)}`);
  fixedCount++;
}

if (fixedCount === 0) {
  console.log('Nada que escribir, no se modificó el archivo.');
  process.exit(0);
}

copyFileSync(GLB_PATH, GLB_PATH + '.bak');

let newJsonStr = JSON.stringify(json);
while (newJsonStr.length % 4 !== 0) newJsonStr += ' '; // padding requerido por el spec GLB
jsonChunk.data = Buffer.from(newJsonStr, 'utf8');

writeGlb(GLB_PATH, glb);
console.log(`\n${fixedCount} nodo(s) corregido(s). Backup previo en ${GLB_PATH}.bak`);
