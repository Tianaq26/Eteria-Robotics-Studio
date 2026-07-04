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

function stub(title, desc) {
  return (container) => {
    container.innerHTML =
      '<div class="dock-stub"><h3>' + title + '</h3><p>' + desc + '</p></div>';
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
    icon: '📝',
    defaultZone: 'left',
    singleton: true,
    mount: adopt('#srcEditorPane'),
  },
  {
    id: 'console',
    title: 'Consola',
    icon: '🖥',
    defaultZone: 'left',
    singleton: true,
    mount: adopt('#srcConsoleWrap'),
  },
  {
    id: 'arena',
    title: 'Visualización 3D',
    icon: '🟢',
    defaultZone: 'center',
    singleton: true,
    mount: adopt('#srcArenaWrap'),
  },
  {
    id: 'control',
    title: 'Control',
    icon: '🎛',
    defaultZone: 'right',
    singleton: true,
    mount: adopt('#mainPanel'),
  },
  {
    id: 'inspector',
    title: 'Inspector',
    icon: '🔍',
    defaultZone: 'right',
    singleton: true,
    mount: stub('Inspector', 'Próximamente: aquí verás las especificaciones físicas del sumobot (tamaño, velocidad máxima, masa) y detalles del bot seleccionado.'),
  },
  {
    id: 'assets',
    title: 'Assets',
    icon: '📦',
    defaultZone: 'right',
    singleton: true,
    mount: stub('Assets', 'Próximamente: explorador de bots preestablecidos y skins guardadas.'),
  },
  {
    id: 'serial',
    title: 'Monitor Serie',
    icon: '🔌',
    defaultZone: 'bottom',
    singleton: true,
    mount: adopt('#srcSerialWrap'),
  },
  {
    id: 'deviceFiles',
    title: 'Archivos del robot',
    icon: '🗂',
    defaultZone: 'right',
    singleton: true,
    mount: adopt('#srcDeviceFilesWrap'),
  },
];

export function getPanel(id) {
  return PANELS.find((p) => p.id === id);
}
