// ======================================================
// panels.js — Registro de paneles dockables.
//
// Cada entrada describe una "ventana" del editor. `mount(container)` para los
// paneles reales ADOPTA un nodo del DOM que ya existe hoy (dentro de
// #panelSources, ver index.html) en vez de reconstruirlo — así ningún id
// interno cambia y el código existente (main.js, scene.js, blocks.js) sigue
// funcionando exactamente igual, solo que el nodo vive en otro lugar del árbol.
//
// Añadir un panel nuevo = un objeto nuevo en este arreglo. No hay que tocar
// dockManager.js para que aparezca en el menú Ventanas y se pueda acoplar.
// ======================================================

import { t } from '../i18n.js';

function stub(titleKey, descKey) {
  return (container) => {
    container.innerHTML =
      '<div class="dock-stub"><h3>' + t(titleKey) + '</h3><p>' + t(descKey) + '</p></div>';
  };
}

function adopt(selector) {
  return (container) => {
    const node = document.querySelector(selector);
    if (node) container.appendChild(node);
  };
}

export const PANELS = [
  {
    id: 'editor',
    title: 'Editor',
    titleKey: 'panel.name.editor',
    icon: '📝',
    defaultZone: 'left',
    singleton: true,
    mount: adopt('#srcEditorPane'),
  },
  {
    id: 'console',
    title: 'Consola',
    titleKey: 'panel.name.console',
    icon: '🖥',
    defaultZone: 'left',
    singleton: true,
    mount: adopt('#srcConsoleWrap'),
  },
  {
    id: 'arena',
    title: 'Visualización 3D',
    titleKey: 'panel.name.arena',
    icon: '🟢',
    defaultZone: 'center',
    singleton: true,
    mount: adopt('#srcArenaWrap'),
  },
  {
    id: 'control',
    title: 'Control',
    titleKey: 'panel.name.control',
    icon: '🎛',
    defaultZone: 'right',
    singleton: true,
    mount: adopt('#mainPanel'),
  },
  {
    id: 'inspector',
    title: 'Inspector',
    titleKey: 'panel.name.inspector',
    icon: '🔍',
    defaultZone: 'right',
    singleton: true,
    mount: stub('panel.name.inspector', 'panel.stub.inspector'),
  },
  {
    id: 'assets',
    title: 'Assets',
    titleKey: 'panel.name.assets',
    icon: '📦',
    defaultZone: 'right',
    singleton: true,
    mount: stub('panel.name.assets', 'panel.stub.assets'),
  },
  {
    id: 'serial',
    title: 'Monitor Serie',
    titleKey: 'panel.name.serial',
    icon: '🔌',
    defaultZone: 'bottom',
    singleton: true,
    mount: adopt('#srcSerialWrap'),
  },
  {
    id: 'deviceFiles',
    title: 'Archivos del robot',
    titleKey: 'panel.name.deviceFiles',
    icon: '🗂',
    defaultZone: 'right',
    singleton: true,
    mount: adopt('#srcDeviceFilesWrap'),
  },
];

export function getPanel(id) {
  return PANELS.find((p) => p.id === id);
}
