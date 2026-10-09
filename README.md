# 🔨 VENDIDO

Juego de bienes raíces multijugador (estilo Monopoly) para celular y computadora, con salas por código, 4 tableros, vista 2D y 3D, trenes, subastas, hipotecas y préstamos del banco.

Hecho para **ÑERO PRODUCHONS**.

---

## Jugar en tu compu (VS Code)

1. Instala **Node.js LTS** desde <https://nodejs.org> (solo una vez).
2. Abre esta carpeta en **Visual Studio Code** (`File → Open Folder…` → `Documentos/vendido`).
3. Abre la terminal de VS Code (`Terminal → New Terminal`) y escribe:
   ```bash
   npm start
   ```
   (Si algún día borras la carpeta `node_modules`, primero corre `npm install`.)
   También puedes abrir `package.json`, pasar el mouse sobre `"start"` y darle **Run Script**.
4. Abre <http://localhost:3000> en tu navegador.
5. Para detenerlo: en la terminal, `Ctrl + C`.

> Atajo en Mac: doble clic a **`Iniciar VENDIDO.command`** (instala lo necesario y abre el juego).

### Jugar con amigos en la misma Wi-Fi
Al iniciar, la terminal muestra una dirección tipo `http://192.168.x.x:3000`. Tus amigos la abren en su celular, ponen su nombre y escriben el **código de sala** que te sale a ti.

---

## Jugar en línea con amigos en cualquier lugar

Hay dos formas. Las dos funcionan desde el celular y se pueden **instalar como app**.

### Opción A — GitHub Pages (gratis, sin servidor) · *modo directo*
El juego ya está publicado en **https://laloguerrero525-ctrl.github.io/vendido/**.
El celular o compu de quien **crea la sala** hace de servidor; los demás se conectan directo con el código.

- La rama `gh-pages` del repositorio tiene la versión publicada (el contenido de `public/`).
- Para publicar cambios: guarda tus cambios con git (`git add -A && git commit -m "cambios"`), luego `git push` y `npm run publicar`.

Importante: quien crea la sala debe **dejar el juego abierto** mientras juegan. Si se cierra, puede reanudar la sala desde la pantalla de inicio (“Reanudar mi sala”).

### Opción B — Render.com (servidor siempre en línea) · *modo servidor*
1. Sube el proyecto a GitHub.
2. En <https://render.com> → **New → Blueprint** → elige tu repo (usa `render.yaml`).
3. Te da una dirección tipo `https://vendido.onrender.com`. Esa la comparten todos.

En el plan gratis el servidor “se duerme” si nadie juega en 15 minutos y tarda ~30 s en despertar.

> Si tienes el juego en GitHub Pages pero quieres usar tu servidor de Render, abre: `https://TU-USUARIO.github.io/REPO/?servidor=https://vendido.onrender.com`

---

## Tableros de paga (Cosmos y Europa 1700)

- Cuestan **$29 MXN los dos**. Solo paga quien crea la sala; sus amigos entran gratis.
- El comprador paga con el botón de PayPal (dentro del juego: *Tableros premium*). A ti te llega el aviso de PayPal con su correo.
- Tú le respondes con **un código** de `codigos-privados.txt` (esta carpeta, solo en tu compu). Él lo escribe en el juego y quedan desbloqueados en su dispositivo.
- Para hacer más códigos: `node scripts/generar-codigos.mjs 50` y luego publica (`git push` + `npm run publicar`).
- **Nunca subas ni compartas `codigos-privados.txt`** (ya está en `.gitignore`).
- Precio y usuario de PayPal.me (`paypal.me/laloguerrero915`): `public/shared/premium.js`.

Ojo: el candado es del lado del juego (sin servidor de pagos), así que alguien con conocimientos de programación podría saltárselo. Para un juego entre amigos está bien; si un día lo vendes en serio, conviene un servidor que valide los pagos.

---

## Instalar en el celular
- **iPhone:** abre el juego en Safari → Compartir → *Agregar a pantalla de inicio*.
- **Android:** abre el juego en Chrome → menú ⋮ → *Instalar app*.
- **Compu:** en Chrome/Edge, ícono de instalar en la barra de direcciones.

---

## Reglas especiales

| Regla | Cómo funciona |
|---|---|
| **Primera vuelta** | Nadie compra ni puja hasta pasar una vez por la Salida (se puede apagar en las reglas de la casa). |
| **Modo normal** | Con todo el color construyes casas desde donde estés (parejo en todo el color). |
| **Modo difícil** | Solo construyes en la propiedad donde **acabas de caer** (y necesitas todo el color). |
| **Trenes** | Con 2+ estaciones, si estás parado en una tuya puedes viajar a cualquier otra tuya (antes de tirar o justo al caer). Gratis, sin cobrar la Salida. Hipotecadas no operan. |
| **Banco que presta** | Si no te alcanza para pagarle a alguien, el banco le paga completo y tú quedas en negativo (le debes al banco). Con deuda no puedes comprar, construir ni pujar. Pagas intereses al pasar por la Salida. |
| **Quiebra** | Cuando tu deuda supera lo que valen tus bienes + el crédito del banco. |
| **Subastas** | Si no compras, se subasta entre todos. También puedes subastar tus propiedades en tu turno. |
| **Hipotecas** | Recibes la mitad del precio. Para recuperarla pagas eso + 10%. Hipotecada no cobra renta. |
| **Tratos** | Propiedades, dinero y tarjetas de “sal de la cárcel”. |

El anfitrión puede cambiar en la sala de espera: dinero inicial, crédito del banco, interés, límite de rondas, tiempo de subasta, bote en la casilla libre y casas limitadas.

---

## Tableros
- **Metrópoli** — la ciudad clásica.
- **Vuelta al Mundo** — ciudades del planeta, estilo El Turista (con trenes famosos).
- **Cosmos** — planetas, lunas, estrellas, nebulosas y galaxias (los trenes son agujeros de gusano).
- **Europa 1700** — París y Londres del siglo XVIII (diligencias en lugar de trenes).

---

## Cómo está hecho (para modificarlo)

```
public/                 ← todo lo que ve el jugador (esto se publica)
  index.html            pantallas
  css/app.css           estilos
  js/main.js            pantallas, conexión y animaciones
  js/game-ui.js         controles de la partida (dados, subasta, tratos…)
  js/board3d.js         tablero 3D/2D con Three.js
  js/boardTexture.js    dibujo de las casillas
  js/net.js             conexión (servidor o directo)
  shared/engine.js      ⭐ reglas del juego
  shared/maps.js        ⭐ los 4 tableros (nombres, colores, cartas)
  shared/room.js        salas por código y bots
  shared/bot.js         inteligencia de los bots
server/index.js         servidor (Express + Socket.IO)
test/                   pruebas de reglas y simulación de partidas
```

- **Agregar o cambiar un mapa:** edita `public/shared/maps.js` (copia uno de los temas).
- **Cambiar reglas:** `public/shared/engine.js`.
- **Probar que nada se rompió:** `npm test` (11 pruebas + 300 partidas simuladas con bots).

### Para después
- Convertirlo en app de tienda (APK / App Store) con Capacitor.
- Más mapas (México, Cancún, Japón…), fichas personalizadas, chat.
