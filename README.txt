NOVA MUSIC — SUBIDA MASIVA

Esta versión añade:
- Selección múltiple de archivos de audio.
- Selección de carpeta para agrupar las canciones por álbum (si el navegador admite selección de carpetas).
- Nombre de canción automático a partir del archivo.
- Artista y portada compartidos para el lote.
- Progreso general y estado individual de cada archivo.
- Reintentos automáticos (hasta 3 intentos) y carga secuencial para reducir errores.
- Campo de álbum en el catálogo.

IMPORTANTE: antes de desplegar esta versión, ejecuta bulk_upload_migration.sql en Supabase > SQL Editor. No vuelvas a ejecutar supabase.sql completo: ya configuraste el proyecto.

PASOS PARA ACTUALIZAR
1. Descomprime nova_music_web.zip.
2. En GitHub abre el repositorio nova-music.
3. Reemplaza los archivos index.html, styles.css, app.js y config.js por los de esta carpeta. También sube bulk_upload_migration.sql.
4. En Supabase abre SQL Editor, crea una consulta nueva, pega bulk_upload_migration.sql y pulsa Run una sola vez.
5. Vercel detectará el cambio en GitHub y volverá a publicar la página automáticamente.

CONFIGURACIÓN
config.js ya contiene la URL del proyecto y la clave publishable compartidas por el propietario. La clave publishable está diseñada para usarse en el navegador; jamás pongas una clave sb_secret_ o service_role en estos archivos.

USO
1. Abre NOVA MUSIC > Panel de artista e inicia sesión con el correo y contraseña de Authentication > Users.
2. Para canciones sueltas, usa “Seleccionar canciones” y selecciona varios archivos a la vez.
3. Para un álbum, usa “Seleccionar una carpeta / álbum”. En navegadores que admitan selección de carpetas, la carpeta principal se usa como nombre del álbum.
4. Escribe el artista; si quieres, escribe un nombre de álbum manual y selecciona una portada común.
5. Pulsa “Subir selección completa”. La página sube una canción a la vez, muestra el estado de cada una y reintenta hasta tres veces si hay un fallo.

NOTAS
- En algunos teléfonos Android el selector de carpetas no está disponible. En ese caso selecciona varias canciones con “Seleccionar canciones” y escribe el nombre del álbum en el campo correspondiente.
- Cada audio tiene un límite de 100 MB por archivo, según la configuración actual de Supabase.
- La carga necesita que mantengas la página abierta hasta terminar.
- Las canciones publicadas son públicas y descargables, como se configuró originalmente.
- Las playlists siguen guardándose localmente en el navegador del visitante.


NUEVO — ACCESO POR MEMBRESÍA APROBADA
- La biblioteca no se consulta hasta iniciar sesión con una cuenta aprobada.
- Las solicitudes nuevas se crean automáticamente como pendientes.
- El administrador puede aprobar, rechazar o suspender cuentas desde el panel de artista.
- El servidor también exige una sesión aprobada para reproducir o descargar; ocultar la interfaz no es la única protección.

ANTES DE ACTIVAR ESTA FUNCIÓN
1. Ejecuta approved_members_migration.sql UNA SOLA VEZ en Supabase > SQL Editor.
2. La migración crea user_access, registra automáticamente solicitudes nuevas y restringe la lectura de songs a usuarios aprobados y administradores.
3. Comprueba que la cuenta administradora siga registrada en public.artist_admins. Esa tabla ya se utiliza para autorizar las subidas.
4. Publica el frontend y despliega el backend actualizado en Render al mismo tiempo. Si solo actualizas uno, el acceso puede fallar.
5. No agregues claves service_role ni secretos al frontend. El backend utiliza las variables que ya existen en Render.

ESTADOS DE CUENTA
- pending: solicitud recibida, sin acceso a canciones.
- approved: acceso a la biblioteca, reproducción y descarga.
- rejected: acceso denegado.
- suspended: acceso retirado por el administrador.

IMPORTANTE
- La migración no borra canciones ni modifica los enlaces MEGA.
- Las cuentas existentes que no sean administradoras quedan pendientes para que el administrador decida su acceso.
- Si Supabase requiere confirmar el correo, la persona deberá confirmar su dirección antes de iniciar sesión.
- El acceso del administrador sigue dependiendo de ADMIN_EMAIL en Render y de su autorización existente en artist_admins para las operaciones de catálogo.


- El acceso desde NOVA MUSIC y el servidor queda protegido. Los enlaces MEGA públicos que alguien ya tenga guardados o haya compartido fuera de NOVA no se revocan con esta migración; para privatizarlos habría que migrar/revocar los enlaces existentes por separado, sin hacerlo automáticamente.
- Las URLs de reproducción de NOVA usan tickets temporales opacos; no exponen el token de sesión de Supabase.
