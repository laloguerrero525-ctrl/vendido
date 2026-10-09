// VENDIDO — definición de tableros.
// Los 4 mapas comparten la misma estructura de 40 casillas (como el clásico)
// y cambian nombres, iconos, colores, cartas y estética.

// ---------------------------------------------------------------------------
// Estructura base (posición -> tipo)
// ---------------------------------------------------------------------------
const LAYOUT = [
  { t: 'go' }, { t: 'prop', g: 0, k: 0 }, { t: 'chest' }, { t: 'prop', g: 0, k: 1 }, { t: 'tax', amount: 200, k: 0 },
  { t: 'station', k: 0 }, { t: 'prop', g: 1, k: 0 }, { t: 'chance' }, { t: 'prop', g: 1, k: 1 }, { t: 'prop', g: 1, k: 2 },
  { t: 'jail' }, { t: 'prop', g: 2, k: 0 }, { t: 'utility', k: 0 }, { t: 'prop', g: 2, k: 1 }, { t: 'prop', g: 2, k: 2 },
  { t: 'station', k: 1 }, { t: 'prop', g: 3, k: 0 }, { t: 'chest' }, { t: 'prop', g: 3, k: 1 }, { t: 'prop', g: 3, k: 2 },
  { t: 'free' }, { t: 'prop', g: 4, k: 0 }, { t: 'chance' }, { t: 'prop', g: 4, k: 1 }, { t: 'prop', g: 4, k: 2 },
  { t: 'station', k: 2 }, { t: 'prop', g: 5, k: 0 }, { t: 'prop', g: 5, k: 1 }, { t: 'utility', k: 1 }, { t: 'prop', g: 5, k: 2 },
  { t: 'gotojail' }, { t: 'prop', g: 6, k: 0 }, { t: 'prop', g: 6, k: 1 }, { t: 'chest' }, { t: 'prop', g: 6, k: 2 },
  { t: 'station', k: 3 }, { t: 'chance' }, { t: 'prop', g: 7, k: 0 }, { t: 'tax', amount: 100, k: 1 }, { t: 'prop', g: 7, k: 1 },
];

// Precio, rentas [sin casas, 1, 2, 3, 4 casas, hotel] y costo de construcción.
const PROP_ECON = {
  1: { price: 60, rent: [2, 10, 30, 90, 160, 250], house: 50 },
  3: { price: 60, rent: [4, 20, 60, 180, 320, 450], house: 50 },
  6: { price: 100, rent: [6, 30, 90, 270, 400, 550], house: 50 },
  8: { price: 100, rent: [6, 30, 90, 270, 400, 550], house: 50 },
  9: { price: 120, rent: [8, 40, 100, 300, 450, 600], house: 50 },
  11: { price: 140, rent: [10, 50, 150, 450, 625, 750], house: 100 },
  13: { price: 140, rent: [10, 50, 150, 450, 625, 750], house: 100 },
  14: { price: 160, rent: [12, 60, 180, 500, 700, 900], house: 100 },
  16: { price: 180, rent: [14, 70, 200, 550, 750, 950], house: 100 },
  18: { price: 180, rent: [14, 70, 200, 550, 750, 950], house: 100 },
  19: { price: 200, rent: [16, 80, 220, 600, 800, 1000], house: 100 },
  21: { price: 220, rent: [18, 90, 250, 700, 875, 1050], house: 150 },
  23: { price: 220, rent: [18, 90, 250, 700, 875, 1050], house: 150 },
  24: { price: 240, rent: [20, 100, 300, 750, 925, 1100], house: 150 },
  26: { price: 260, rent: [22, 110, 330, 800, 975, 1150], house: 150 },
  27: { price: 260, rent: [22, 110, 330, 800, 975, 1150], house: 150 },
  29: { price: 280, rent: [24, 120, 360, 850, 1025, 1200], house: 150 },
  31: { price: 300, rent: [26, 130, 390, 900, 1100, 1275], house: 200 },
  32: { price: 300, rent: [26, 130, 390, 900, 1100, 1275], house: 200 },
  34: { price: 320, rent: [28, 150, 450, 1000, 1200, 1400], house: 200 },
  37: { price: 350, rent: [35, 175, 500, 1100, 1300, 1500], house: 200 },
  39: { price: 400, rent: [50, 200, 600, 1400, 1700, 2000], house: 200 },
};
export const STATION_PRICE = 200;
export const STATION_RENT = [25, 50, 100, 200];
export const UTILITY_PRICE = 150;

// ---------------------------------------------------------------------------
// Cartas: los efectos son iguales en todos los mapas; el texto cambia.
// Marcadores {tNN} se reemplazan por el nombre de la casilla NN.
// ---------------------------------------------------------------------------
export const CHANCE_EFFECTS = [
  { id: 'c_go', fx: 'moveTo', to: 0 },
  { id: 'c_red3', fx: 'moveTo', to: 24 },
  { id: 'c_pink1', fx: 'moveTo', to: 11 },
  { id: 'c_util', fx: 'nearest', kind: 'utility' },
  { id: 'c_st1', fx: 'nearest', kind: 'station' },
  { id: 'c_st2', fx: 'nearest', kind: 'station' },
  { id: 'c_div', fx: 'collect', amount: 50 },
  { id: 'c_jailfree', fx: 'jailFree' },
  { id: 'c_back3', fx: 'back', steps: 3 },
  { id: 'c_jail', fx: 'jail' },
  { id: 'c_repairs', fx: 'repairs', house: 25, hotel: 100 },
  { id: 'c_fine', fx: 'pay', amount: 15 },
  { id: 'c_st0', fx: 'moveTo', to: 5 },
  { id: 'c_top', fx: 'moveTo', to: 39 },
  { id: 'c_chair', fx: 'payEach', amount: 50 },
  { id: 'c_loan', fx: 'collect', amount: 150 },
];
export const CHEST_EFFECTS = [
  { id: 'k_go', fx: 'moveTo', to: 0 },
  { id: 'k_error', fx: 'collect', amount: 200 },
  { id: 'k_doctor', fx: 'pay', amount: 50 },
  { id: 'k_sale', fx: 'collect', amount: 50 },
  { id: 'k_jailfree', fx: 'jailFree' },
  { id: 'k_jail', fx: 'jail' },
  { id: 'k_bday', fx: 'collectEach', amount: 10 },
  { id: 'k_fund', fx: 'collect', amount: 100 },
  { id: 'k_refund', fx: 'collect', amount: 20 },
  { id: 'k_life', fx: 'collect', amount: 100 },
  { id: 'k_hospital', fx: 'pay', amount: 100 },
  { id: 'k_school', fx: 'pay', amount: 50 },
  { id: 'k_consult', fx: 'collect', amount: 25 },
  { id: 'k_repairs', fx: 'repairs', house: 40, hotel: 115 },
  { id: 'k_contest', fx: 'collect', amount: 10 },
  { id: 'k_inherit', fx: 'collect', amount: 100 },
];

// ---------------------------------------------------------------------------
// Temas
// ---------------------------------------------------------------------------
const THEMES = {
  // ------------------------------------------------------------------ MUNDO
  mundo: {
    id: 'mundo',
    name: 'Vuelta al Mundo',
    blurb: 'Ciudades de todo el planeta, al estilo El Turista.',
    currency: '$',
    groups: [
      { name: 'Caribe y Andes', color: '#8a5a3b' },
      { name: 'África', color: '#7fd0f0' },
      { name: 'Sudamérica', color: '#e0559b' },
      { name: 'Oriente', color: '#f39a2b' },
      { name: 'Mediterráneo', color: '#e43d3d' },
      { name: 'Europa', color: '#f4d23c' },
      { name: 'Asia-Pacífico', color: '#2fae62' },
      { name: 'Norteamérica', color: '#2563c9' },
    ],
    props: [
      [{ name: 'Cusco', icon: '🇵🇪' }, { name: 'La Habana', icon: '🇨🇺' }],
      [{ name: 'Marrakech', icon: '🇲🇦' }, { name: 'El Cairo', icon: '🇪🇬' }, { name: 'Ciudad del Cabo', icon: '🇿🇦' }],
      [{ name: 'Cartagena', icon: '🇨🇴' }, { name: 'Buenos Aires', icon: '🇦🇷' }, { name: 'Río de Janeiro', icon: '🇧🇷' }],
      [{ name: 'Mumbai', icon: '🇮🇳' }, { name: 'Estambul', icon: '🇹🇷' }, { name: 'Dubái', icon: '🇦🇪' }],
      [{ name: 'Atenas', icon: '🇬🇷' }, { name: 'Barcelona', icon: '🇪🇸' }, { name: 'Roma', icon: '🇮🇹' }],
      [{ name: 'Ámsterdam', icon: '🇳🇱' }, { name: 'Londres', icon: '🇬🇧' }, { name: 'París', icon: '🇫🇷' }],
      [{ name: 'Sídney', icon: '🇦🇺' }, { name: 'Seúl', icon: '🇰🇷' }, { name: 'Tokio', icon: '🇯🇵' }],
      [{ name: 'Nueva York', icon: '🇺🇸' }, { name: 'Cancún', icon: '🇲🇽' }],
    ],
    stations: [
      { name: 'Orient Express', icon: '🚂' },
      { name: 'Transiberiano', icon: '🚂' },
      { name: 'Eurostar', icon: '🚄' },
      { name: 'Shinkansen', icon: '🚅' },
    ],
    stationWord: 'tren',
    travelVerb: 'Viajar en tren',
    utilities: [{ name: 'Aerolínea Mundial', icon: '✈️' }, { name: 'Crucero Global', icon: '🛳️' }],
    taxes: [{ name: 'Impuesto de salida', icon: '🛂' }, { name: 'Exceso de equipaje', icon: '🧳' }],
    corners: {
      go: { name: 'Salida', sub: 'Cobra $200 al pasar', icon: '🌍' },
      jail: { name: 'Aduana', sub: 'Solo de visita', icon: '🛃' },
      free: { name: 'Playa libre', sub: 'Descansa', icon: '🏖️' },
      gotojail: { name: '¡Retenido!', sub: 'Ve a la aduana', icon: '👮' },
    },
    decks: { chance: { name: 'Pasaporte', icon: '🛂' }, chest: { name: 'Maleta', icon: '🧳' } },
    chanceText: {
      c_go: 'Vuelo directo a {t0}. Cobra tu salario.',
      c_red3: 'Te ganaste un tour: avanza hasta {t24}.',
      c_pink1: 'Escala inesperada: avanza hasta {t11}.',
      c_util: 'Avanza a la empresa de transporte más cercana. Si tiene dueño, paga 10 veces los dados.',
      c_st1: 'Toma el tren más cercano. Si tiene dueño, paga el doble.',
      c_st2: 'Toma el tren más cercano. Si tiene dueño, paga el doble.',
      c_div: 'Tu blog de viajes se hizo viral. Cobra $50.',
      c_jailfree: 'Visa diplomática: sales de la aduana gratis. Guárdala.',
      c_back3: 'Olvidaste el pasaporte. Regresa 3 casillas.',
      c_jail: 'Te revisaron la maleta. Ve directo a la aduana.',
      c_repairs: 'Renovación turística: paga $25 por casa y $100 por hotel.',
      c_fine: 'Multa por cruzar en rojo. Paga $15.',
      c_st0: 'Sube al {t5}.',
      c_top: 'Vacaciones soñadas: avanza hasta {t39}.',
      c_chair: 'Invitas la cena del grupo. Paga $50 a cada jugador.',
      c_loan: 'Recuperaste el depósito del hostal. Cobra $150.',
    },
    chestText: {
      k_go: 'Regresas a {t0}. Cobra tu salario.',
      k_error: 'La aerolínea te compensa por el retraso. Cobra $200.',
      k_doctor: 'Consulta médica en el extranjero. Paga $50.',
      k_sale: 'Vendiste tus fotos de viaje. Cobra $50.',
      k_jailfree: 'Visa diplomática: sales de la aduana gratis. Guárdala.',
      k_jail: 'Traías fruta en la maleta. Ve directo a la aduana.',
      k_bday: 'Es tu cumpleaños en Roma. Cada jugador te da $10.',
      k_fund: 'Te reembolsan el boleto. Cobra $100.',
      k_refund: 'Devolución de impuestos al turista. Cobra $20.',
      k_life: 'Tu seguro de viaje paga. Cobra $100.',
      k_hospital: 'Te picó un mosquito raro. Paga $100 de hospital.',
      k_school: 'Curso intensivo de idiomas. Paga $50.',
      k_consult: 'Das un tour guiado. Cobra $25.',
      k_repairs: 'Temporada de huracanes: paga $40 por casa y $115 por hotel.',
      k_contest: 'Segundo lugar en concurso de fotografía. Cobra $10.',
      k_inherit: 'Herencia de un tío en el extranjero. Cobra $100.',
    },
    look: {
      style: 'mundo',
      font: '"Baloo 2", "Fredoka", system-ui, sans-serif',
      boardBg: '#d9eef7', tileBg: '#fbfdff', ink: '#173b57', line: '#7fb2cf',
      centerBg: '#1f7fb6', accent: '#ffd23f',
      sky: ['#5cc0f2', '#d8f1ff'], fog: null,
      title: 'VENDIDO', subtitle: 'Vuelta al Mundo',
    },
  },

  // -------------------------------------------------------------- METRÓPOLI
  metropoli: {
    id: 'metropoli',
    name: 'Metrópoli',
    blurb: 'La ciudad clásica: avenidas, barrios y estaciones.',
    currency: '$',
    groups: [
      { name: 'Barrio Viejo', color: '#8b5a2b' },
      { name: 'El Puerto', color: '#9fd8f2' },
      { name: 'Centro', color: '#d83f8f' },
      { name: 'Bohemio', color: '#f28c28' },
      { name: 'Distrito Rojo', color: '#e0322e' },
      { name: 'Zona Dorada', color: '#f2cf2e' },
      { name: 'Las Lomas', color: '#22a35a' },
      { name: 'Bahía', color: '#1d5fbf' },
    ],
    props: [
      [{ name: 'Callejón del Gato', icon: '🐈' }, { name: 'Calle Vieja', icon: '🏚️' }],
      [{ name: 'Muelle Seis', icon: '⚓' }, { name: 'Calle del Puerto', icon: '🐟' }, { name: 'Paseo del Río', icon: '🌉' }],
      [{ name: 'Plaza Central', icon: '⛲' }, { name: 'Calle Comercio', icon: '🛍️' }, { name: 'Av. del Teatro', icon: '🎭' }],
      [{ name: 'Barrio Bohemio', icon: '🎨' }, { name: 'Calle del Arte', icon: '🖼️' }, { name: 'Mercado Grande', icon: '🧺' }],
      [{ name: 'Av. Libertad', icon: '🗽' }, { name: 'Bulevar Neón', icon: '🌃' }, { name: 'Paseo Imperial', icon: '🏛️' }],
      [{ name: 'Plaza del Sol', icon: '☀️' }, { name: 'Calle Oro', icon: '💰' }, { name: 'Torre Dorada', icon: '🏙️' }],
      [{ name: 'Parque Esmeralda', icon: '🌳' }, { name: 'Av. Bosques', icon: '🌲' }, { name: 'Lomas Altas', icon: '⛰️' }],
      [{ name: 'Marina Azul', icon: '🛥️' }, { name: 'Mirador Real', icon: '🏰' }],
    ],
    stations: [
      { name: 'Estación Central', icon: '🚂' },
      { name: 'Estación Norte', icon: '🚂' },
      { name: 'Estación Oriente', icon: '🚂' },
      { name: 'Estación del Puerto', icon: '🚂' },
    ],
    stationWord: 'tren',
    travelVerb: 'Viajar en tren',
    utilities: [{ name: 'Compañía de Luz', icon: '💡' }, { name: 'Compañía de Agua', icon: '🚰' }],
    taxes: [{ name: 'Impuesto predial', icon: '🧾' }, { name: 'Impuesto de lujo', icon: '💎' }],
    corners: {
      go: { name: 'Salida', sub: 'Cobra $200 al pasar', icon: '🏁' },
      jail: { name: 'Cárcel', sub: 'Solo de visita', icon: '🔒' },
      free: { name: 'Parada libre', sub: 'Estaciónate gratis', icon: '🅿️' },
      gotojail: { name: 'Ve a la cárcel', sub: 'Directo, sin cobrar', icon: '🚓' },
    },
    decks: { chance: { name: 'Suerte', icon: '❓' }, chest: { name: 'Caja de comunidad', icon: '📦' } },
    chanceText: {
      c_go: 'Avanza hasta {t0}. Cobra $200.',
      c_red3: 'Avanza hasta {t24}. Si pasas por la Salida, cobra $200.',
      c_pink1: 'Avanza hasta {t11}. Si pasas por la Salida, cobra $200.',
      c_util: 'Avanza a la compañía más cercana. Si tiene dueño, paga 10 veces los dados.',
      c_st1: 'Avanza a la estación más cercana. Si tiene dueño, paga el doble.',
      c_st2: 'Avanza a la estación más cercana. Si tiene dueño, paga el doble.',
      c_div: 'El banco te paga dividendos. Cobra $50.',
      c_jailfree: 'Sal de la cárcel gratis. Guárdala hasta usarla.',
      c_back3: 'Regresa 3 casillas.',
      c_jail: 'Ve directo a la cárcel. No pasas por la Salida.',
      c_repairs: 'Reparaciones generales: paga $25 por casa y $100 por hotel.',
      c_fine: 'Multa por exceso de velocidad. Paga $15.',
      c_st0: 'Toma el tren en {t5}.',
      c_top: 'Pasea por {t39}.',
      c_chair: 'Te eligieron presidente del consejo. Paga $50 a cada jugador.',
      c_loan: 'Tu préstamo de construcción vence a tu favor. Cobra $150.',
    },
    chestText: {
      k_go: 'Avanza hasta {t0}. Cobra $200.',
      k_error: 'Error del banco a tu favor. Cobra $200.',
      k_doctor: 'Honorarios del doctor. Paga $50.',
      k_sale: 'Vendiste acciones. Cobra $50.',
      k_jailfree: 'Sal de la cárcel gratis. Guárdala hasta usarla.',
      k_jail: 'Ve directo a la cárcel. No pasas por la Salida.',
      k_bday: 'Es tu cumpleaños. Cada jugador te da $10.',
      k_fund: 'Vence tu fondo de vacaciones. Cobra $100.',
      k_refund: 'Devolución de impuestos. Cobra $20.',
      k_life: 'Vence tu seguro de vida. Cobra $100.',
      k_hospital: 'Cuenta del hospital. Paga $100.',
      k_school: 'Colegiatura. Paga $50.',
      k_consult: 'Cobra $25 por una asesoría.',
      k_repairs: 'Reparaciones de calles: paga $40 por casa y $115 por hotel.',
      k_contest: 'Segundo lugar en concurso de belleza. Cobra $10.',
      k_inherit: 'Recibes una herencia. Cobra $100.',
    },
    look: {
      style: 'metropoli',
      font: '"Archivo Black", "Arial Black", system-ui, sans-serif',
      boardBg: '#cfe6d3', tileBg: '#f6fbf4', ink: '#14281b', line: '#1b3a26',
      centerBg: '#bfe0c7', accent: '#e0322e',
      sky: ['#9fc7e8', '#eaf3f9'], fog: null,
      title: 'VENDIDO', subtitle: 'Metrópoli',
    },
  },

  // ---------------------------------------------------------------- ESPACIO
  espacio: {
    id: 'espacio',
    name: 'Cosmos',
    blurb: 'Planetas, lunas, estrellas, nebulosas y galaxias.',
    currency: '₡',
    groups: [
      { name: 'Vecindario', color: '#9c6b4e' },
      { name: 'Lunas heladas', color: '#7fe3ff' },
      { name: 'Gigantes gaseosos', color: '#ff5fb7' },
      { name: 'Estrellas cercanas', color: '#ffa53a' },
      { name: 'Supergigantes', color: '#ff4a4a' },
      { name: 'Exoplanetas', color: '#ffe066' },
      { name: 'Nebulosas', color: '#3ddc84' },
      { name: 'Galaxias', color: '#5b7bff' },
    ],
    props: [
      [{ name: 'La Luna', icon: '🌙' }, { name: 'Marte', icon: '🔴' }],
      [{ name: 'Ceres', icon: '🪨' }, { name: 'Europa', icon: '🧊' }, { name: 'Titán', icon: '🟠' }],
      [{ name: 'Neptuno', icon: '🔵' }, { name: 'Saturno', icon: '🪐' }, { name: 'Júpiter', icon: '🟤' }],
      [{ name: 'Próxima Centauri', icon: '⭐' }, { name: 'Sirio', icon: '🌟' }, { name: 'Vega', icon: '✨' }],
      [{ name: 'Antares', icon: '🔴' }, { name: 'Rigel', icon: '💠' }, { name: 'Betelgeuse', icon: '🔥' }],
      [{ name: 'Kepler-452b', icon: '🌎' }, { name: 'Próxima b', icon: '🌍' }, { name: 'TRAPPIST-1', icon: '🌏' }],
      [{ name: 'Nebulosa del Cangrejo', icon: '🦀' }, { name: 'Nebulosa de Orión', icon: '🌌' }, { name: 'Pilares de la Creación', icon: '🏛️' }],
      [{ name: 'Andrómeda', icon: '🌀' }, { name: 'Vía Láctea', icon: '🌌' }],
    ],
    stations: [
      { name: 'Portal Alfa', icon: '🌀' },
      { name: 'Portal Beta', icon: '🌀' },
      { name: 'Portal Gamma', icon: '🌀' },
      { name: 'Portal Delta', icon: '🌀' },
    ],
    stationWord: 'portal',
    travelVerb: 'Cruzar el agujero de gusano',
    utilities: [{ name: 'Planta de fusión', icon: '⚛️' }, { name: 'Minería de hielo', icon: '❄️' }],
    taxes: [{ name: 'Impuesto de lanzamiento', icon: '🚀' }, { name: 'Tarifa de órbita', icon: '🛰️' }],
    corners: {
      go: { name: 'Lanzamiento', sub: 'Cobra ₡200 al pasar', icon: '🚀' },
      jail: { name: 'Prisión orbital', sub: 'Solo de visita', icon: '🛰️' },
      free: { name: 'Gravedad cero', sub: 'Flota tranquilo', icon: '👨‍🚀' },
      gotojail: { name: 'Arresto galáctico', sub: 'A la prisión orbital', icon: '👽' },
    },
    decks: { chance: { name: 'Anomalía', icon: '☄️' }, chest: { name: 'Transmisión', icon: '📡' } },
    chanceText: {
      c_go: 'Un salto hiperespacial te regresa a {t0}. Cobra tu salario.',
      c_red3: 'Curso fijado hacia {t24}.',
      c_pink1: 'La gravedad te arrastra hasta {t11}.',
      c_util: 'Avanza a la instalación más cercana. Si tiene dueño, paga 10 veces los dados.',
      c_st1: 'Entra al portal más cercano. Si tiene dueño, paga el doble.',
      c_st2: 'Entra al portal más cercano. Si tiene dueño, paga el doble.',
      c_div: 'Tu satélite encontró agua. Cobra ₡50.',
      c_jailfree: 'Código de inmunidad: sales de la prisión orbital gratis. Guárdalo.',
      c_back3: 'Falla en los propulsores. Retrocede 3 casillas.',
      c_jail: 'Invadiste espacio restringido. Ve a la prisión orbital.',
      c_repairs: 'Tormenta solar: paga ₡25 por base y ₡100 por estación espacial.',
      c_fine: 'Basura espacial en tu órbita. Paga ₡15.',
      c_st0: 'Entra al {t5}.',
      c_top: 'Viaje intergaláctico a {t39}.',
      c_chair: 'Financias la misión del grupo. Paga ₡50 a cada jugador.',
      c_loan: 'Vendiste muestras de asteroide. Cobra ₡150.',
    },
    chestText: {
      k_go: 'Regresa a {t0}. Cobra tu salario.',
      k_error: 'Error de la computadora central a tu favor. Cobra ₡200.',
      k_doctor: 'Revisión médica en gravedad cero. Paga ₡50.',
      k_sale: 'Vendiste combustible sobrante. Cobra ₡50.',
      k_jailfree: 'Código de inmunidad: sales de la prisión orbital gratis. Guárdalo.',
      k_jail: 'Contrabando de meteoritos. Ve a la prisión orbital.',
      k_bday: 'Cumples un año terrestre. Cada jugador te da ₡10.',
      k_fund: 'Bono de la agencia espacial. Cobra ₡100.',
      k_refund: 'Te devuelven peaje de órbita. Cobra ₡20.',
      k_life: 'Tu seguro de misión paga. Cobra ₡100.',
      k_hospital: 'Radiación cósmica: paga ₡100 de enfermería.',
      k_school: 'Academia de pilotos. Paga ₡50.',
      k_consult: 'Asesoras a unos marcianos. Cobra ₡25.',
      k_repairs: 'Lluvia de meteoritos: paga ₡40 por base y ₡115 por estación espacial.',
      k_contest: 'Segundo lugar en carrera de cohetes. Cobra ₡10.',
      k_inherit: 'Heredaste una nave. Cobra ₡100.',
    },
    look: {
      style: 'espacio',
      font: '"Orbitron", "Arial", system-ui, sans-serif',
      boardBg: '#0d1030', tileBg: '#151a45', ink: '#e8ecff', line: '#4a54a8',
      centerBg: '#070920', accent: '#7cf3ff',
      sky: ['#02030c', '#0b0f2a'], fog: null,
      title: 'VENDIDO', subtitle: 'Cosmos',
    },
  },

  // ------------------------------------------------------------ EUROPA 1700
  europa: {
    id: 'europa',
    name: 'Europa 1700',
    blurb: 'París y Londres del siglo XVIII: niebla, tejados y palacios.',
    currency: '£',
    groups: [
      { name: 'Arrabales de Londres', color: '#6b4a2f' },
      { name: 'París popular', color: '#8fb6c4' },
      { name: 'Londres comercial', color: '#a5486e' },
      { name: 'Corazón de París', color: '#c9772d' },
      { name: 'Londres monumental', color: '#9e2b25' },
      { name: 'París real', color: '#c9a13b' },
      { name: 'Westminster', color: '#3f6b3a' },
      { name: 'La Corona', color: '#2c3f73' },
    ],
    props: [
      [{ name: 'Whitechapel', icon: '🕯️' }, { name: 'Southwark', icon: '🍺' }],
      [{ name: 'Faubourg Saint-Antoine', icon: '🪵' }, { name: 'Les Halles', icon: '🧀' }, { name: 'Barrio Latino', icon: '📜' }],
      [{ name: 'Covent Garden', icon: '🌹' }, { name: 'Fleet Street', icon: '🖋️' }, { name: 'The Strand', icon: '🎩' }],
      [{ name: 'Île de la Cité', icon: '⛪' }, { name: 'Pont Neuf', icon: '🌉' }, { name: 'Place des Vosges', icon: '⛲' }],
      [{ name: 'Torre de Londres', icon: '🏰' }, { name: 'Puente de Londres', icon: '🌉' }, { name: 'Catedral de San Pablo', icon: '⛪' }],
      [{ name: 'Palais-Royal', icon: '👑' }, { name: 'Las Tullerías', icon: '🌷' }, { name: 'El Louvre', icon: '🖼️' }],
      [{ name: 'Hyde Park', icon: '🌳' }, { name: 'Mayfair', icon: '🍷' }, { name: 'Palacio de St James', icon: '🏛️' }],
      [{ name: 'Notre-Dame', icon: '⛪' }, { name: 'Versalles', icon: '👑' }],
    ],
    stations: [
      { name: 'Posta de Dover', icon: '🐎' },
      { name: 'Posta de Calais', icon: '🐎' },
      { name: 'Posta de Ruan', icon: '🐎' },
      { name: 'Posta de Canterbury', icon: '🐎' },
    ],
    stationWord: 'diligencia',
    travelVerb: 'Viajar en diligencia',
    utilities: [{ name: 'Gremio de Faroleros', icon: '🏮' }, { name: 'Acueducto Real', icon: '⛲' }],
    taxes: [{ name: 'Diezmo', icon: '⚜️' }, { name: 'Impuesto de la Corona', icon: '👑' }],
    corners: {
      go: { name: 'Puerta de la ciudad', sub: 'Cobra £200 al pasar', icon: '🚪' },
      jail: { name: 'La Bastilla', sub: 'Solo de visita', icon: '🏯' },
      free: { name: 'La Taberna', sub: 'Un descanso', icon: '🍻' },
      gotojail: { name: '¡A la Bastilla!', sub: 'Arrestado por la guardia', icon: '⚔️' },
    },
    decks: { chance: { name: 'Fortuna', icon: '🎲' }, chest: { name: 'Gremio', icon: '📜' } },
    chanceText: {
      c_go: 'Un carruaje te lleva a {t0}. Cobra tu renta.',
      c_red3: 'Te citan en {t24}. Avanza.',
      c_pink1: 'Un mensajero te guía hasta {t11}.',
      c_util: 'Avanza al gremio más cercano. Si tiene dueño, paga 10 veces los dados.',
      c_st1: 'Toma la diligencia más cercana. Si tiene dueño, paga el doble.',
      c_st2: 'Toma la diligencia más cercana. Si tiene dueño, paga el doble.',
      c_div: 'Tu barco llegó de las Indias. Cobra £50.',
      c_jailfree: 'Indulto real: sales de la Bastilla gratis. Guárdalo.',
      c_back3: 'Te persigue la guardia. Retrocede 3 casillas por los tejados.',
      c_jail: 'Te descubrieron espiando. Ve directo a la Bastilla.',
      c_repairs: 'Incendio en la ciudad: paga £25 por casa y £100 por palacio.',
      c_fine: 'Multa por duelo en la vía pública. Paga £15.',
      c_st0: 'Toma la {t5}.',
      c_top: 'El rey te invita a {t39}.',
      c_chair: 'Pagas el banquete del gremio. Paga £50 a cada jugador.',
      c_loan: 'Ganaste una apuesta en la taberna. Cobra £150.',
    },
    chestText: {
      k_go: 'Regresa a {t0}. Cobra tu renta.',
      k_error: 'El tesorero real se equivocó a tu favor. Cobra £200.',
      k_doctor: 'Un boticario te atiende. Paga £50.',
      k_sale: 'Vendiste especias. Cobra £50.',
      k_jailfree: 'Indulto real: sales de la Bastilla gratis. Guárdalo.',
      k_jail: 'Robaste pan del mercado. Ve directo a la Bastilla.',
      k_bday: 'Celebras tu santo. Cada jugador te da £10.',
      k_fund: 'Cobras deudas de juego. Cobra £100.',
      k_refund: 'El recaudador te devuelve el diezmo. Cobra £20.',
      k_life: 'Un noble te nombra en su testamento. Cobra £100.',
      k_hospital: 'Te hirieron en un duelo. Paga £100 al cirujano.',
      k_school: 'Lecciones de esgrima. Paga £50.',
      k_consult: 'Escribes cartas para un conde. Cobra £25.',
      k_repairs: 'Inundación del río: paga £40 por casa y £115 por palacio.',
      k_contest: 'Segundo lugar en el torneo de esgrima. Cobra £10.',
      k_inherit: 'Heredas un viñedo. Cobra £100.',
    },
    look: {
      style: 'europa',
      font: '"IM Fell English SC", "Cinzel", Georgia, serif',
      boardBg: '#d9c8a2', tileBg: '#efe3c4', ink: '#2e2116', line: '#6d5233',
      centerBg: '#cbb68a', accent: '#8f1f1f',
      sky: ['#5d6670', '#c9c2b0'], fog: '#b9b2a2',
      title: 'VENDIDO', subtitle: 'Europa 1700',
    },
  },
};

// ---------------------------------------------------------------------------
// Construye el mapa completo (casillas con economía + textos de cartas)
// ---------------------------------------------------------------------------
function buildMap(theme) {
  const tiles = LAYOUT.map((L, i) => {
    const base = { i, t: L.t };
    switch (L.t) {
      case 'prop': {
        const p = theme.props[L.g][L.k];
        const e = PROP_ECON[i];
        return { ...base, g: L.g, name: p.name, icon: p.icon, price: e.price, rent: e.rent, house: e.house, color: theme.groups[L.g].color };
      }
      case 'station': {
        const s = theme.stations[L.k];
        return { ...base, k: L.k, name: s.name, icon: s.icon, price: STATION_PRICE };
      }
      case 'utility': {
        const u = theme.utilities[L.k];
        return { ...base, k: L.k, name: u.name, icon: u.icon, price: UTILITY_PRICE };
      }
      case 'tax': {
        const x = theme.taxes[L.k];
        return { ...base, name: x.name, icon: x.icon, amount: L.amount };
      }
      case 'chance':
        return { ...base, name: theme.decks.chance.name, icon: theme.decks.chance.icon };
      case 'chest':
        return { ...base, name: theme.decks.chest.name, icon: theme.decks.chest.icon };
      default: {
        const c = theme.corners[L.t];
        return { ...base, name: c.name, sub: c.sub, icon: c.icon };
      }
    }
  });
  const fill = (txt) => txt.replace(/\{t(\d+)\}/g, (_, n) => tiles[+n].name);
  const chance = CHANCE_EFFECTS.map((c) => ({ ...c, deck: 'chance', text: fill(theme.chanceText[c.id]) }));
  const chest = CHEST_EFFECTS.map((c) => ({ ...c, deck: 'chest', text: fill(theme.chestText[c.id]) }));
  const groups = theme.groups.map((g, gi) => ({ ...g, tiles: tiles.filter((t) => t.t === 'prop' && t.g === gi).map((t) => t.i) }));
  return {
    id: theme.id, name: theme.name, blurb: theme.blurb, currency: theme.currency,
    tiles, groups, cards: { chance, chest }, decks: theme.decks,
    stationWord: theme.stationWord, travelVerb: theme.travelVerb, look: theme.look,
    stationTiles: [5, 15, 25, 35], utilityTiles: [12, 28],
  };
}

export const MAPS = Object.fromEntries(Object.values(THEMES).map((t) => [t.id, buildMap(t)]));
export const MAP_ORDER = ['metropoli', 'mundo', 'espacio', 'europa'];
export function getMap(id) { return MAPS[id] || MAPS.metropoli; }
