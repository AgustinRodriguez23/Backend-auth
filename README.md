# Backend II — Autenticación (Registro, Login y Hasheo de Contraseñas)

## 1. Arquitectura del Proyecto

### 1.1 Estructura de carpetas

```
backend2/
├── .env.example
├── .gitignore
├── package.json
├── README.md
└── src/
    ├── server.js                   # Punto de entrada: conecta DB y levanta el servidor
    ├── app.js                      # Configuración de Express (middlewares, rutas)
    │
    ├── config/
    │   ├── db.js                   # Conexión a MongoDB (Mongoose)
    │   ├── passport.js              # Registra las estrategias de Passport (local, github, jwt)
    │   └── session.js               # Configuración de express-session + connect-mongo
    │
    ├── models/
    │   └── User.js                  # Schema de Mongoose + hook de hasheo con bcrypt
    │
    ├── routes/
    │   ├── authRoutes.js            # /register, /login, /logout, /github, /github/callback
    │   ├── sessionRoutes.js         # /session
    │   └── protectedRoutes.js       # /profile, /admin
    │
    ├── controllers/
    │   ├── authController.js        # register, login, logout, githubCallback
    │   ├── sessionController.js     # getSession
    │   └── protectedController.js   # getProfile, getAdminData
    │
    ├── middlewares/
    │   ├── errorHandler.js          # Manejo centralizado de errores
    │   ├── authenticateJWT.js       # Valida JWT -> 401 si falla
    │   └── authorizeRole.js         # Valida rol -> 403 si falla
    │
    ├── strategies/
    │   ├── local.strategy.js        # Passport Local (email + password)
    │   ├── github.strategy.js       # Passport GitHub OAuth2
    │   └── jwt.strategy.js          # Passport JWT (cookie o header Authorization)
    │
    └── utils/
        └── generateToken.js         # Genera el JWT + opciones de cookie
```

### 1.2 Explicación de cada capa

| Capa | Responsabilidad |
|---|---|
| **config** | Configuración externa a la lógica de la app: conexión a la base de datos, variables de entorno, y (más adelante) configuración de Passport. No contiene lógica de negocio. |
| **models** | Define los schemas de Mongoose (forma de los datos en MongoDB) y comportamientos propios del dato, como el hook que hashea la contraseña antes de guardar o el método para compararla. Es la única capa que habla directamente con la base de datos. |
| **routes** | Define los endpoints de la API (método HTTP + path) y los asocia a la función del controller correspondiente. No tiene lógica, solo "cablea" URL → controller, y puede aplicar middlewares específicos de esa ruta (ej. validaciones, autenticación). |
| **controllers** | Contiene la lógica de negocio: recibe el `req`, valida datos de entrada, interactúa con los `models`, arma la respuesta (`res`) y delega errores al middleware de errores con `next(error)`. |
| **middlewares** | Funciones que se ejecutan entre el request y la respuesta final: manejo de errores, autenticación/autorización, logging, validaciones reusables, etc. |
| **strategies** | Estrategias de [Passport.js](http://www.passportjs.org/) (ej. `passport-jwt`, `passport-local`) que encapsulan cómo se valida la identidad de un usuario en cada mecanismo de autenticación soportado. |

### 1.3 Diagrama del flujo de autenticación

```
REGISTRO
┌────────┐   POST /api/v1/auth/register   ┌────────────┐   valida datos +   ┌──────────────┐
│ Cliente│ ──────────────────────────────▶│ authController│ ──duplicados──▶ │ Model User    │
└────────┘   { firstName, email, pass }   │  .register()  │                │ (hook bcrypt)  │
     ▲                                     └────────────┘                  └──────┬────────┘
     │           201 Created / usuario                                            │ guarda hash
     └───────────────────────────────────────────────────────────────────────────┘
                                                                                    ▼
                                                                              MongoDB (users)


LOGIN
┌────────┐   POST /api/v1/auth/login      ┌────────────┐   busca por email  ┌──────────────┐
│ Cliente│ ──────────────────────────────▶│ authController│ ──────────────▶│ Model User    │
└────────┘   { email, password }          │   .login()   │                 └──────┬────────┘
     ▲                                     └────────────┘                         │
     │                                           │            compara hash        │
     │                                           │◀──────(bcrypt.compare)─────────┘
     │        200 OK + JWT firmado                │
     └───────────────────────────────────────────┘
     ▼ error
  401 Unauthorized (credenciales inválidas)


LOGOUT
┌────────┐  POST /api/v1/auth/logout      ┌────────────────┐   token válido    ┌────────────┐
│ Cliente│ ──Authorization: Bearer <token>▶│ authenticateJWT │──────────────────▶│ authController│
└────────┘                                 └────────────────┘                   │  .logout()   │
     ▲                                                                          └──────┬───────┘
     │              200 OK (sesión/token invalidado)                                   │
     └─────────────────────────────────────────────────────────────────────────────────┘


LOGIN CON GITHUB (OAuth)
┌────────┐  GET /api/v1/auth/github        ┌──────────────────┐
│ Cliente│ ───────────────────────────────▶│ passport.authenticate('github')│
└────────┘                                 └──────────────────┘
     │                                              │
     │                                    redirige a GitHub (login/autorización)
     ▼
  GitHub OAuth ──────▶ GET /api/v1/auth/github/callback
                              │
                              ▼
                    passport.authenticate('github', { session:false })
                              │
                              ▼
                    authController.githubCallback()
                              │
                              ▼
                200 OK + JWT firmado / redirect con token


RUTA PROTEGIDA — PERFIL
┌────────┐   GET /api/v1/profile           ┌────────────────┐   verifica firma   ┌────────────────────┐
│ Cliente│ ──Authorization: Bearer <token>▶│ authenticateJWT │──y expiración─────▶│ protectedController │
└────────┘                                 └────────────────┘                   │   .getProfile()      │
     ▲                                              │                           └──────────┬──────────┘
     │       401 Unauthorized (token inválido)      │                                      │
     │◀─────────────────────────────────────────────┘                          200 OK + datos del perfil
     │                                                                                      │
     └──────────────────────────────────────────────────────────────────────────────────────┘


RUTA PROTEGIDA + AUTORIZACIÓN POR ROL — ADMIN
┌────────┐  GET /api/v1/admin              ┌────────────────┐   token OK       ┌────────────────┐
│ Cliente│ ──Authorization: Bearer <token>▶│ authenticateJWT │─────────────────▶│ authorizeRole   │
└────────┘                                 └────────────────┘                  │  ('admin')      │
     ▲                                                                          └───────┬────────┘
     │      403 Forbidden (role ≠ admin)                                                │ role OK
     │◀──────────────────────────────────────────────────────────────────────────────── ┤
     │                                                                                   ▼
     │                                                                    ┌──────────────────────┐
     │                                                                    │ protectedController    │
     │                                                                    │   .getAdminData()      │
     │                                                                    └───────────┬────────────┘
     │                200 OK + datos administrativos                                  │
     └────────────────────────────────────────────────────────────────────────────────┘


SESIÓN ACTIVA (express-session)
┌────────┐   GET /api/v1/session           ┌──────────────────┐   lee sesión de   ┌────────────┐
│ Cliente│ ──Cookie: connect.sid──────────▶│ sessionController │──MongoDB store───▶│ MongoDB     │
└────────┘                                 │   .getSession()   │                  │ (sessions)  │
     ▲                                     └──────────────────┘                   └────────────┘
     │        200 OK + datos de sesión activa
     │        (o 401 si no hay sesión válida)
     └──────────────────────────────────────
```

---

## 2. Implementación Técnica

### 2.1 Registro de Usuario — `POST /api/v1/auth/register`

#### Modelo `User` (`src/models/User.js`)

Puntos clave del modelo:

- El campo `password` **nunca se guarda en texto plano**: se hashea automáticamente en un hook `pre('save')` de Mongoose, solo cuando ese campo fue modificado.
- El email tiene `unique: true`, lo que crea un índice único en MongoDB (primera barrera contra duplicados, a nivel de base de datos).
- `toJSON()` está sobreescrito para que el hash de la contraseña **nunca** viaje en las respuestas de la API, aunque el controller haga `res.json({ user })` pasando el documento completo.

```js
const SALT_ROUNDS = 10;

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(SALT_ROUNDS);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};
```

*(código completo en `src/models/User.js`)*

#### Ejemplo de hasheo con bcrypt

```js
const bcrypt = require('bcrypt');

const plainPassword = 'MiContraseña123';
const salt = await bcrypt.genSalt(10);         // genera el "salt" (costo 10)
const hash = await bcrypt.hash(plainPassword, salt);
// hash -> "$2b$10$KIXQ8y1rN0Z...VeRy.LoNg.Hash"

// Para verificar en el login:
const isMatch = await bcrypt.compare(plainPassword, hash); // true
```

`bcrypt` incluye el salt dentro del propio hash resultante, por eso no hace falta guardarlo aparte.

#### Validación de duplicados

Se valida en dos niveles, para cubrir condiciones de carrera:

1. **A nivel aplicación** (`authController.js`): antes de crear el usuario, se busca si ya existe un `User` con ese email.
2. **A nivel base de datos**: el índice `unique: true` sobre `email` hace que Mongo rechace el insert con el código de error `11000` si dos requests llegan casi simultáneamente y ambas pasan la primera validación.

```js
const existingUser = await User.findOne({ email: email.toLowerCase() });
if (existingUser) {
  return res.status(409).json({
    success: false,
    message: 'Ya existe un usuario registrado con ese email',
  });
}
```

```js
// catch del controller
if (error.code === 11000) {
  return res.status(409).json({
    success: false,
    message: 'Ya existe un usuario registrado con ese email',
  });
}
```

#### Ejemplo de Request

```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "firstName": "Ana",
  "lastName": "Gómez",
  "email": "ana.gomez@mail.com",
  "password": "MiContraseña123"
}
```

#### Ejemplo de Response — éxito (201 Created)

```json
{
  "success": true,
  "message": "Usuario registrado correctamente",
  "user": {
    "_id": "66a1f0c2e4b0a1a2b3c4d5e6",
    "firstName": "Ana",
    "lastName": "Gómez",
    "email": "ana.gomez@mail.com",
    "role": "user",
    "createdAt": "2026-07-17T22:30:00.000Z",
    "updatedAt": "2026-07-17T22:30:00.000Z"
  }
}
```

Notar que **no** viene el campo `password` en la respuesta (removido por `toJSON()` del modelo).

#### Ejemplo de Response — email duplicado (409 Conflict)

```json
{
  "success": false,
  "message": "Ya existe un usuario registrado con ese email"
}
```

#### Ejemplo de Response — datos inválidos (400 Bad Request)

```json
{
  "success": false,
  "message": "La contraseña debe tener al menos 8 caracteres"
}
```

### 2.2 Login Local (Passport) — `POST /api/v1/auth/login`

#### Configuración de la Passport Local Strategy (`src/strategies/local.strategy.js`)

Usa `email` como `usernameField` (por defecto Passport espera `username`) y delega la verificación de contraseña al método `comparePassword` del modelo:

```js
const localStrategy = new LocalStrategy(
  { usernameField: 'email', passwordField: 'password' },
  async (email, password, done) => {
    const user = await User.findOne({ email: email.toLowerCase(), provider: 'local' });
    if (!user) return done(null, false, { message: 'Credenciales inválidas' });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return done(null, false, { message: 'Credenciales inválidas' });

    return done(null, user);
  }
);
```

Se registra en `src/config/passport.js` con `passport.use('local', localStrategy)`. **No usamos `express-session`** ni `serializeUser`/`deserializeUser`: la API es stateless, cada request se autentica con el JWT (cookie o header), no con una sesión guardada en el servidor.

#### Generación del JWT (`src/utils/generateToken.js`)

Payload mínimo: `userId` y `role` (nada de datos sensibles, el JWT es legible en Base64 por cualquiera que lo tenga). Expira en `1h`, configurable por `JWT_EXPIRES_IN`:

```js
export const generateToken = (user) => {
  const payload = { userId: user._id, role: user.role };
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1h', // "1h"
  });
};
```

#### Envío del token en Body y en Cookie (`src/controllers/authController.js`)

```js
export const login = (req, res, next) => {
  passport.authenticate('local', { session: false }, (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      return res.status(401).json({ success: false, message: info?.message || 'Credenciales inválidas' });
    }

    const token = generateToken(user);

    // Cookie httpOnly, además del token en el body
    res.cookie('authToken', token, cookieOptions());

    return res.status(200).json({
      success: true,
      message: 'Login exitoso',
      token,        // <- token en el BODY
      user,
    });
  })(req, res, next);
};
```

Configuración de la cookie (`src/utils/generateToken.js`):

```js
export const cookieOptions = () => ({
  httpOnly: true,                                  // JS del browser no puede leerla -> mitiga XSS
  sameSite: 'Lax',                                  // no se envía en requests cross-site de terceros -> mitiga CSRF
  secure: process.env.NODE_ENV === 'production',    // solo viaja por HTTPS en producción
  maxAge: 60 * 60 * 1000,                           // 1 hora, en sincronía con JWT_EXPIRES_IN
});
```

#### Ejemplo de Request

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "ana.gomez@mail.com",
  "password": "MiContraseña123"
}
```

#### Ejemplo de Response — éxito (200 OK)

```
Set-Cookie: authToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...; HttpOnly; SameSite=Lax; Max-Age=3600
```

```json
{
  "success": true,
  "message": "Login exitoso",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2NmExZjBjMmU0YjBhMWEyYjNjNGQ1ZTYiLCJyb2xlIjoidXNlciIsImlhdCI6MTc1MjgwMDAwMCwiZXhwIjoxNzUyODAzNjAwfQ.firma",
  "user": {
    "_id": "66a1f0c2e4b0a1a2b3c4d5e6",
    "firstName": "Ana",
    "lastName": "Gómez",
    "email": "ana.gomez@mail.com",
    "role": "user",
    "provider": "local"
  }
}
```

#### Ejemplo de Response — credenciales inválidas (401 Unauthorized)

```json
{
  "success": false,
  "message": "Credenciales inválidas"
}
```

---

### 2.3 Login OAuth con GitHub

#### Configuración de la estrategia (`src/strategies/github.strategy.js`)

```js
const githubStrategy = new GitHubStrategy(
  {
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: process.env.GITHUB_CALLBACK_URL,
    scope: ['user:email'],
  },
  async (accessToken, refreshToken, profile, done) => {
    // ver creación/vinculación de usuario abajo
  }
);
```

Se crea una **GitHub OAuth App** en `https://github.com/settings/developers`, de donde salen `GITHUB_CLIENT_ID` y `GITHUB_CLIENT_SECRET`. La `callbackURL` tiene que coincidir exactamente con la configurada ahí (ej. `http://localhost:3000/api/v1/auth/github/callback`).

#### Creación del usuario si no existe

```js
async (accessToken, refreshToken, profile, done) => {
  // 1. ¿Ya existe un usuario vinculado a este githubId?
  let user = await User.findOne({ githubId: profile.id });
  if (user) return done(null, user);

  const email = profile.emails?.[0]?.value || `${profile.username}@github.local`;

  // 2. ¿Existe una cuenta local con ese mismo email? Se vincula en vez de duplicar
  user = await User.findOne({ email: email.toLowerCase() });
  if (user) {
    user.githubId = profile.id;
    await user.save();
    return done(null, user);
  }

  // 3. Si no existe de ninguna forma, se crea un usuario nuevo (sin password)
  const newUser = await User.create({
    firstName: profile.displayName?.split(' ')[0] || profile.username,
    lastName: profile.displayName?.split(' ').slice(1).join(' ') || 'GitHub',
    email: email.toLowerCase(),
    provider: 'github',
    githubId: profile.id,
  });

  return done(null, newUser);
}
```

El modelo `User` soporta esto porque `password` solo es `required` cuando `provider === 'local'` (ver `src/models/User.js`).

#### Rutas (`src/routes/authRoutes.js`)

```js
// Paso 1: redirige al usuario a GitHub para que autorice la app
router.get('/github', passport.authenticate('github', { session: false }));

// Paso 2: GitHub redirige acá con el "code" de autorización
router.get(
  '/github/callback',
  passport.authenticate('github', { session: false, failureRedirect: '/api/v1/auth/login' }),
  githubCallback // emite el JWT igual que en el login local
);
```

#### ¿Cómo se mantiene la sesión?

Acá **no hay sesión de servidor en ningún momento**, ni siquiera durante el handshake de OAuth: todas las estrategias se registran con `{ session: false }`, así que Passport nunca llama a `serializeUser`/`deserializeUser` ni depende de `express-session`.

Lo que reemplaza a la "sesión" es el mismo mecanismo que en el login local:

1. GitHub redirige al callback con el usuario ya autenticado por Passport (`req.user`).
2. `githubCallback` genera un JWT (`generateToken`) con `{ userId, role }` y lo manda **en el body y en la cookie `authToken`**, exactamente igual que en `/login`.
3. En requests posteriores, el cliente reenvía ese JWT (vía cookie automáticamente, o vía header `Authorization: Bearer <token>`) y una estrategia `passport-jwt` (a implementar en el middleware de rutas protegidas) lo valida sin tocar la base de datos de sesiones, porque no existe tal cosa: el propio token, firmado y con expiración, *es* la sesión.

En otras palabras: la "sesión" es stateless y vive enteramente en el JWT, no en memoria ni en Mongo. Esto es lo que permite que login local y login OAuth converjan al mismo mecanismo de autenticación para el resto de la API.

#### Fragmentos clave de configuración

`src/config/passport.js`:

```js
passport.use('local', localStrategy);
passport.use('github', githubStrategy);
// Sin serializeUser/deserializeUser: no hay sesión de servidor
```

`src/app.js`:

```js
app.use(cookieParser());
app.use(passport.initialize()); // sin passport.session()
```

`.env`:

```
GITHUB_CLIENT_ID=tu_client_id
GITHUB_CLIENT_SECRET=tu_client_secret
GITHUB_CALLBACK_URL=http://localhost:3000/api/v1/auth/github/callback
```

### 2.4 Sistema de Sesiones (`express-session` + `connect-mongo`)

Esto es un mecanismo **separado y en paralelo** al JWT: convive con él, pero uno no depende del otro. El login (`/api/v1/auth/login`) alimenta ambos al mismo tiempo.

#### Configuración (`src/config/session.js`)

```js
const sessionConfig = session({
  secret: process.env.SESSION_SECRET,
  resave: false,             // no reescribir la sesión si no cambió
  saveUninitialized: false,  // no crear sesión vacía para visitantes anónimos
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    collectionName: 'sessions',
    ttl: 60 * 60, // 1 hora
  }),
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 1000,
  },
});
```

`connect-mongo` persiste cada sesión activa como un documento en la colección `sessions` de la misma base de MongoDB (`MONGO_URI`), en vez de guardarla en memoria del proceso Node (que se perdería en cada reinicio o al escalar a más de una instancia).

Se registra en `app.js` **antes** de `passport.initialize()`:

```js
app.use(sessionConfig);
app.use(passport.initialize());
```

#### Qué se guarda en la sesión (en `login`, `src/controllers/authController.js`)

```js
req.session.userId = user._id.toString();
req.session.role = user.role;
req.session.email = user.email;
```

#### Ejemplo de documento de sesión en MongoDB (colección `sessions`)

```json
{
  "_id": "k3f9s8d7a6h5g4j3k2l1poiuytrewq",
  "expires": { "$date": "2026-07-17T23:30:00.000Z" },
  "session": "{\"cookie\":{\"originalMaxAge\":3600000,\"expires\":\"2026-07-17T23:30:00.000Z\",\"httpOnly\":true,\"sameSite\":\"lax\"},\"userId\":\"66a1f0c2e4b0a1a2b3c4d5e6\",\"role\":\"user\",\"email\":\"ana.gomez@mail.com\"}"
}
```

`connect-mongo` guarda el campo `session` como un string JSON (comportamiento por defecto); `_id` es el `sessionID` que también viaja en la cookie `connect.sid` del navegador.

#### `GET /api/v1/session` (`src/controllers/sessionController.js`)

```js
export const getSession = (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, message: 'No hay una sesión activa' });
  }

  return res.status(200).json({
    success: true,
    session: {
      id: req.sessionID,
      userId: req.session.userId,
      email: req.session.email,
      role: req.session.role,
      cookie: { expires: req.session.cookie.expires, maxAge: req.session.cookie.maxAge },
    },
  });
};
```

#### Ejemplo de Response — con sesión activa (200 OK)

```json
{
  "success": true,
  "session": {
    "id": "k3f9s8d7a6h5g4j3k2l1poiuytrewq",
    "userId": "66a1f0c2e4b0a1a2b3c4d5e6",
    "email": "ana.gomez@mail.com",
    "role": "user",
    "cookie": {
      "expires": "2026-07-17T23:30:00.000Z",
      "maxAge": 3599982
    }
  }
}
```

#### Ejemplo de Response — sin sesión (401 Unauthorized)

```json
{
  "success": false,
  "message": "No hay una sesión activa"
}
```

---

### 2.5 Rutas Protegidas

Acá el mecanismo es el **JWT** (no la sesión de Mongo): `authenticateJWT` valida el token vía `passport-jwt` (estrategia completada en `src/strategies/jwt.strategy.js`, que lee el token de la cookie `authToken` o del header `Authorization: Bearer <token>`).

#### `GET /api/v1/profile` — protegida por JWT

```js
// src/routes/protectedRoutes.js
router.get('/profile', authenticateJWT, getProfile);
```

```js
// src/middlewares/authenticateJWT.js
const authenticateJWT = (req, res, next) => {
  passport.authenticate('jwt', { session: false }, (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'No autenticado. Token ausente, inválido o expirado',
      });
    }
    req.user = user;
    next();
  })(req, res, next);
};
```

```js
// src/controllers/protectedController.js
export const getProfile = (req, res) => {
  return res.status(200).json({
    success: true,
    message: 'Perfil obtenido correctamente',
    user: req.user,
  });
};
```

**Ejemplo de Request:**

```http
GET /api/v1/profile
Cookie: authToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

*(o, sin cookie, `Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`)*

**Ejemplo de Response — éxito (200 OK):**

```json
{
  "success": true,
  "message": "Perfil obtenido correctamente",
  "user": {
    "_id": "66a1f0c2e4b0a1a2b3c4d5e6",
    "firstName": "Ana",
    "lastName": "Gómez",
    "email": "ana.gomez@mail.com",
    "role": "user"
  }
}
```

#### `GET /api/v1/admin` — protegida por JWT + rol

```js
// src/routes/protectedRoutes.js
router.get('/admin', authenticateJWT, authorizeRole('admin'), getAdminData);
```

```js
// src/middlewares/authorizeRole.js
const authorizeRole = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'No autenticado' });
  }
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'No tenés permisos para acceder a este recurso',
    });
  }
  next();
};
```

#### Cómo se demuestran `401` y `403`

| Escenario | Middleware que corta | Status | Response |
|---|---|---|---|
| Sin token, o token inválido/expirado | `authenticateJWT` | **401** | `{ "success": false, "message": "No autenticado. Token ausente, inválido o expirado" }` |
| Token válido, pero `role !== 'admin'` | `authorizeRole('admin')` | **403** | `{ "success": false, "message": "No tenés permisos para acceder a este recurso" }` |
| Token válido y `role === 'admin'` | — (pasa) | **200** | `{ "success": true, "message": "Bienvenido admin ..." }` |

**Ejemplo Request/Response — 401 (sin token):**

```http
GET /api/v1/admin
```

```json
{
  "success": false,
  "message": "No autenticado. Token ausente, inválido o expirado"
}
```

**Ejemplo Request/Response — 403 (usuario autenticado, rol `user`):**

```http
GET /api/v1/admin
Cookie: authToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (usuario con role: "user")
```

```json
{
  "success": false,
  "message": "No tenés permisos para acceder a este recurso"
}
```

**Ejemplo Request/Response — 200 (usuario `admin`):**

```json
{
  "success": true,
  "message": "Bienvenido admin Carla, acceso concedido a datos restringidos"
}
```

La diferencia clave entre ambos códigos: **401 = "no sé quién sos"** (falla la autenticación), **403 = "sé quién sos, pero no podés"** (falla la autorización). Por eso siempre van en ese orden en la cadena de middlewares: primero `authenticateJWT`, después `authorizeRole`.

### 2.6 Logout — `POST /api/v1/auth/logout`

El logout tiene que resolver dos mecanismos distintos (sesión y JWT), que no se cierran de la misma forma.

#### 1) Destrucción de la sesión

`req.session.destroy()` borra el documento correspondiente en la colección `sessions` de Mongo (vía `connect-mongo`). A partir de ahí, aunque alguien reenvíe la cookie `sessionId` vieja, `connect-mongo` no va a encontrar nada asociado a ese id.

```js
req.session.destroy((err) => {
  if (err) return next(err);
  res.clearCookie('sessionId');
  return res.status(200).json({ success: true, message: 'Sesión cerrada correctamente' });
});
```

#### 2) Limpieza de cookies

```js
res.clearCookie('authToken', cookieOptions()); // cookie del JWT
res.clearCookie('sessionId');                   // cookie de express-session
```

`clearCookie` necesita las mismas opciones (`path`, `httpOnly`, `sameSite`, `secure`) que se usaron al crear la cookie con `res.cookie(...)`, para que el navegador la identifique y la elimine correctamente. Por eso reutilizamos la misma función `cookieOptions()` del login.

#### 3) Manejo del token en el cliente — la parte que el servidor NO puede resolver

Acá está el punto conceptual importante de esta consigna: **un JWT ya emitido no se puede "revocar" del lado del servidor** (a diferencia de la sesión, que sí se borra de la base). El servidor solo controla la cookie que él mismo puso; si el token también quedó guardado en otro lado del cliente (`localStorage`, una variable en memoria de una app móvil, una colección de Postman), ese logout del servidor no lo toca — sigue siendo un JWT válido hasta que expire.

Por eso, el cliente tiene responsabilidad propia en el logout:

```js
// Ejemplo del lado del cliente (ej. frontend en fetch/axios)
async function logout() {
  await fetch('/api/v1/auth/logout', {
    method: 'POST',
    credentials: 'include', // para que viajen las cookies authToken y sessionId
  });

  // Si el cliente además guardaba el token a mano (ej. para mandarlo por header
  // Authorization en vez de depender de la cookie), tiene que descartarlo acá:
  localStorage.removeItem('authToken'); // o borrar la variable en memoria, etc.
}
```

Mitigaciones que ya están aplicadas en este proyecto para acotar el riesgo de un JWT "colgado" después del logout:

- `JWT_EXPIRES_IN=1h`: aunque el cliente no borre el token, deja de servir en como máximo una hora.
- El token viaja por defecto en una cookie `httpOnly`, no accesible desde JS del navegador (mitiga que quede pegado en `localStorage` por descuido en el flujo web normal).

*(Fuera del alcance de esta consigna, pero como referencia: para invalidar JWTs on-demand antes de su expiración se suele agregar una blacklist en Redis/Mongo, o un campo `tokenVersion` en el `User` que se incrementa en cada logout y se valida en `jwt.strategy.js`.)*

#### Ejemplo de Request

```http
POST /api/v1/auth/logout
Cookie: authToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...; sessionId=k3f9s8d7a6h5g4j3k2l1poiuytrewq
```

#### Ejemplo de Response — éxito (200 OK)

```
Set-Cookie: authToken=; Max-Age=0
Set-Cookie: sessionId=; Max-Age=0
```

```json
{
  "success": true,
  "message": "Sesión cerrada correctamente"
}
```

#### Ejemplo de Response — sin autenticar (401 Unauthorized)

Como la ruta pasa por `authenticateJWT`, si no hay token válido no llega ni a intentar cerrar nada:

```json
{
  "success": false,
  "message": "No autenticado. Token ausente, inválido o expirado"
}
```

---

## 3. Cómo correrlo localmente

```bash
npm install
cp .env.example .env   # completar MONGO_URI y JWT_SECRET
npm run dev
```

## 4. Próximos pasos (siguientes consignas)

- Recuperación / cambio de contraseña
- Rate limiting en `/login` para mitigar fuerza bruta
- Blacklist de tokens / `tokenVersion` para poder revocar un JWT antes de que expire
- Tests automatizados de los endpoints
