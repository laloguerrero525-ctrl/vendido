// VENDIDO — configuración de conexión para jugar en línea.
//
// Hay dos formas de que tus amigos se conecten desde redes distintas (otra casa, datos móviles):
//
// 1) SERVIDOR (lo más confiable): publica el servidor en Render.com (ver README) y pega aquí su
//    dirección. Con esto, la versión de GitHub Pages se conecta sola a ese servidor.
//      Ejemplo: export const SERVIDOR = 'https://vendido.onrender.com';
//
// 2) MODO DIRECTO + RELEVO (TURN): si no usas servidor, los celulares se conectan directo entre sí.
//    En el mismo WiFi casi siempre funciona, pero con datos móviles hace falta un "relevo" TURN.
//    Pega aquí los datos que te da tu proveedor de TURN (p. ej. metered.ca o expressturn.com).
//      Ejemplo:
//      export const TURN = [
//        { urls: 'turn:relay.ejemplo.com:443?transport=tcp', username: 'usuario', credential: 'clave' },
//      ];

export const SERVIDOR = 'https://vendido-u2b7.onrender.com';

export const TURN = [];
