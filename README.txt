NOVA MUSIC — TU PLATAFORMA DE CANCIONES INÉDITAS
=================================================

Este proyecto incluye:
- Biblioteca pública de canciones.
- Reproductor con controles, progreso y volumen.
- Descarga directa de cada audio.
- Buscador.
- Crear y eliminar playlists (se guardan en el navegador del visitante).
- Panel privado de artista para subir canciones y portadas.
- Diseño adaptable a celular y computadora con animaciones.

IMPORTANTE
----------
Para que todas las personas puedan entrar desde internet, necesitas conectar una base de datos/almacenamiento y publicar la web. Este proyecto usa Supabase (backend) y Vercel (hosting). No necesitas programar el servidor.

PASO 1 — Crear tu backend gratuito
----------------------------------
1. Entra a https://supabase.com y crea una cuenta/proyecto.
2. Dentro del proyecto abre SQL Editor > New query.
3. Abre el archivo supabase.sql de esta carpeta, copia todo y ejecútalo.
4. Ve a Project Settings > API (o Data API / API Keys).
5. Copia Project URL y la clave anon/public.

PASO 2 — Conectar la página
---------------------------
1. Abre config.js.
2. Reemplaza PEGA_AQUI_TU_PROJECT_URL con tu Project URL.
3. Reemplaza PEGA_AQUI_TU_ANON_PUBLIC_KEY con tu clave anon/public.
4. Guarda el archivo.

No pongas nunca la clave service_role en config.js. La clave anon/public es la correcta; la seguridad la aplican las políticas SQL.

PASO 3 — Crear tu usuario administrador
---------------------------------------
1. En Supabase abre Authentication > Users.
2. Añade un usuario con tu correo y contraseña (o activa el registro y regístrate).
3. Copia el UUID/ID del usuario creado.
4. En SQL Editor ejecuta esta consulta, sustituyendo el UUID:

   insert into public.artist_admins (user_id)
   values ('PEGA_AQUI_EL_UUID_DE_TU_USUARIO');

5. Ya puedes iniciar sesión desde el botón "Panel de artista".
6. Solo tu usuario autorizado podrá subir canciones. Los visitantes no necesitan cuenta.

PASO 4 — Publicar la página en internet
---------------------------------------
Opción sencilla: Vercel
1. Crea una cuenta en https://vercel.com.
2. Sube esta carpeta a un repositorio de GitHub (puedes hacerlo desde la web de GitHub).
3. En Vercel elige Add New > Project e importa ese repositorio.
4. Pulsa Deploy. Es una web estática, no necesita comandos de compilación.
5. Vercel te dará una dirección pública que puedes compartir.

También puedes usar Netlify o Cloudflare Pages.

CÓMO SE USA
-----------
- Abre tu web y pulsa "Panel de artista".
- Inicia sesión con el usuario que autorizaste.
- Escribe título, artista y selecciona un archivo de audio.
- Opcionalmente añade una portada.
- Pulsa "Publicar canción".
- La canción aparecerá para todos y podrán reproducirla o descargarla.

PLAYLISTS
---------
Las playlists se guardan localmente en el navegador de cada visitante. Cada persona tiene sus propias listas en su propio dispositivo. No son listas compartidas entre usuarios ni sincronizadas entre dispositivos.

LÍMITES Y PRIVACIDAD
--------------------
- El límite configurado es 100 MB por archivo de audio y 10 MB por portada.
- Los archivos del bucket son públicos porque solicitaste que cualquiera pueda reproducirlos y descargarlos.
- No publiques demos que deban permanecer privadas: cualquiera que tenga el enlace del archivo puede acceder.
- Antes de publicar música inédita, asegúrate de que realmente quieres que sea pública y descargable.
- El almacenamiento gratuito de Supabase tiene cuotas; revisa sus límites/precios vigentes antes de subir una biblioteca grande.

PERSONALIZACIÓN
---------------
Puedes cambiar el nombre NOVA MUSIC en index.html y los colores en styles.css.
