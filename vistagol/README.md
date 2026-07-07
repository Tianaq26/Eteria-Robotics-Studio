# VistaGol ⚽

**Ve tu asiento antes de comprarlo.**

VistaGol es un sistema de boletería con visualización 3D del estadio: el aficionado explora el estadio, elige una sección, selecciona su asiento en el mapa y ve **exactamente cómo se ve la cancha desde esa butaca** antes de pagar. Ningún club de Primera División de Costa Rica ofrece esto hoy — ni los sistemas de ticketing que actualmente alquilan los clubes grandes lo incluyen.

> 🎯 **Demo en vivo:** _(publicá el repo en GitHub Pages y pegá el link aquí)_

---

## ¿Qué resuelve?

| Problema actual | Con VistaGol |
|---|---|
| El aficionado compra "a ciegas" sin saber qué tan bien se ve desde su zona | Vista 3D real desde cada asiento antes de pagar |
| Asientos con vista obstruida generan reclamos y desconfianza | Postes y techos son visibles en el preview — transparencia total |
| Los mapas de boletería son diagramas 2D planos y genéricos | Estadio 3D navegable, adaptado al modelo real de cada estadio |
| Zonas caras difíciles de justificar en precio | El aficionado *ve* la diferencia entre platea y popular |

## Cómo funciona la demo

1. **Vista general** — el estadio completo en 3D, navegable con el mouse (rotar, zoom).
2. **Clic en una sección** — la cámara vuela hacia la zona y se abre el mapa de asientos con disponibilidad y precio.
3. **Elegir asiento** — aparece la "entrada" con el código del asiento (ej. `O3-F12-14`).
4. **"Ver desde este asiento"** — la cámara vuela hasta la butaca exacta y podés mirar alrededor en primera persona, como si estuvieras sentado ahí.
5. **Comprar** — en esta demo el flujo termina en un paso simulado; en producción conecta con la pasarela de pago del club (tarjeta, SINPE Móvil) y emite el boleto con QR.

## Stack técnico

- **Three.js** — render 3D en el navegador, sin plugins ni descargas.
- **Estadio procedural** — gradas, techo, torres de iluminación y **+9,000 asientos** generados por código con `InstancedMesh` (un solo draw call: corre fluido incluso en celulares).
- **Datos de asientos** — cada butaca tiene posición real en el mundo 3D, sección, fila, número, precio y estado de disponibilidad.
- **Vanilla JS + esbuild** — sin frameworks; el bundle final es un solo archivo estático. Se hospeda gratis en GitHub Pages / Vercel / Netlify.

Este prototipo usa un **estadio genérico**. Para un club real, el sistema se adapta al modelo 3D de su estadio (levantado a partir de planos, fotos o captura con drone) sin cambiar la arquitectura del código: los asientos siguen siendo datos generados proceduralmente sobre la geometría de cada grada.

## Correr localmente

```bash
git clone https://github.com/TU_USUARIO/vistagol.git
cd vistagol
npm install
npm run dev      # servidor local en http://localhost:8080
```

Para reconstruir el bundle después de editar `src/`:

```bash
npm run build
```

## Publicar el demo (GitHub Pages)

El repo ya incluye el bundle compilado (`app.js`), así que basta con:

1. Subir el repo a GitHub.
2. **Settings → Pages → Source: Deploy from branch → `main` / root.**
3. En ~1 minuto el demo queda en vivo en `https://TU_USUARIO.github.io/vistagol/`.

## Estructura

```
vistagol/
├── index.html        # UI: landing, panel de asientos, tarjeta-boleto
├── style.css         # Sistema de diseño (tema "partido nocturno")
├── app.js            # Bundle compilado (listo para producción)
├── src/
│   ├── main.js       # Cámara, transiciones, controles, lógica de UI
│   └── stadium.js    # Generador procedural del estadio y asientos
└── docs/
    └── PROPUESTA.md  # One-pager para presentar a clubes
```

## Roadmap hacia producción

- [ ] Modelo 3D del estadio real del club (a escala, con obstrucciones reales)
- [ ] Backend de inventario en tiempo real (evitar doble venta del mismo asiento)
- [ ] Pasarela de pago (tarjeta + SINPE Móvil) y emisión de boleto QR
- [ ] Cuentas de usuario / membresías de socios con asiento fijo
- [ ] Panel administrativo del club: precios por partido, bloqueo de zonas, reportes de venta

## Autor

**Sebastián Aguilar Quesada** — desarrollador de software y videojuegos (Unity 3D, web full-stack). Medalla de Oro nacional Infomatrix y competidor iberoamericano.

## Licencia

MIT — ver [LICENSE](LICENSE).
