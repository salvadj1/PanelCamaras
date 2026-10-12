/**
 * Descripción "humana" de los bloques de configuración de la cámara (equivale a ConfigSchemas.kt):
 * qué ajustes mostrar, con qué título, qué explicación y qué tipo de control. El editor solo enseña los
 * ajustes que la cámara devuelve de verdad; el resto del bloque queda en "Avanzado".
 * Tipos (t): toggle · slider{min,max,unit,labels} · choice{options:[[valor,texto]]} · num{unit} · str · pass · ro
 */
const XmSchemas = (() => {
  const F = (key, title, help, kind) => ({ key, title, help, kind });
  const Toggle = { t: 'toggle' }, Str = { t: 'str' }, Pass = { t: 'pass' }, RO = { t: 'ro' };
  const Slider = (min, max, unit = '', labels = {}) => ({ t: 'slider', min, max, unit, labels });
  const Choice = options => ({ t: 'choice', options });
  const Num = (unit = '') => ({ t: 'num', unit });

  /** Acciones comunes al detectar un evento ([trigger]: "movimiento", "una persona"...). */
  const handlerFields = trigger => [
    F('EventHandler.RecordEnable', 'Grabar en la tarjeta SD', `Guarda un clip en la SD cuando detecta ${trigger}. Necesita tarjeta SD y que la grabación no esté apagada.`, Toggle),
    F('EventHandler.SnapEnable', 'Hacer una foto', `Guarda una foto en la SD cuando detecta ${trigger}.`, Toggle),
    F('EventHandler.MessageEnable', 'Enviar mensaje de alarma', 'Avisa a las aplicaciones conectadas a la cámara (incluida la nube del fabricante, si está activa).', Toggle),
    F('EventHandler.MailEnable', 'Enviar email', `Manda un correo cuando detecta ${trigger}. Requiere configurar «Email (SMTP)».`, Toggle),
    F('EventHandler.FTPEnable', 'Subir fotos y vídeo a FTP', 'Envía el material a tu servidor FTP. Requiere configurar «FTP».', Toggle),
    F('EventHandler.BeepEnable', 'Pitido de la cámara', 'Hace sonar el zumbador interno de la cámara.', Toggle),
    F('EventHandler.RecordLatch', 'Segundos extra de grabación', 'Cuánto sigue grabando después de que termine el evento.', Num('s')),
    F('EventHandler.EventLatch', 'Pausa entre avisos', 'Tras un aviso, ignora nuevos eventos durante este tiempo para no repetirlos.', Num('s'))
  ];

  /** Campos de un flujo de vídeo; p es "MainFormat" o "ExtraFormat". */
  const streamFields = p => [
    F(`${p}.Video.Resolution`, 'Resolución', 'Tamaño de la imagen (p. ej. 1080P, 720P, D1). Escribe solo valores que acepte tu cámara.', Str),
    F(`${p}.Video.FPS`, 'Fotogramas por segundo', 'Más fotogramas = movimiento más fluido, pero más datos y más espacio en la SD.', Num('fps')),
    F(`${p}.Video.BitRate`, 'Caudal de vídeo', 'Más caudal = mejor calidad y más espacio ocupado en la SD y en la red.', Num('kbps')),
    F(`${p}.Video.Quality`, 'Calidad', 'De 1 (más baja) a 6 (más alta). Solo actúa con caudal variable.', Slider(1, 6)),
    F(`${p}.Video.BitRateControl`, 'Tipo de caudal', 'Constante mantiene el mismo caudal siempre; variable lo adapta a la escena.', Choice([['CBR', 'Constante'], ['VBR', 'Variable']])),
    F(`${p}.Video.Gop`, 'Intervalo de fotograma clave', 'Cada cuántos fotogramas hay uno completo. Más bajo = se salta mejor en el vídeo, pero pesa más.', Num()),
    F(`${p}.Video.Compression`, 'Códec', 'Formato de compresión del vídeo (solo lectura).', RO),
    F(`${p}.AudioEnable`, 'Incluir audio', 'Graba y transmite el sonido del micrófono de la cámara.', Toggle)
  ];

  const DAYS = [['Never', 'Nunca'], ['Everyday', 'Todos los días'], ['Monday', 'Los lunes'], ['Tuesday', 'Los martes'],
    ['Wednesday', 'Los miércoles'], ['Thursday', 'Los jueves'], ['Friday', 'Los viernes'], ['Saturday', 'Los sábados'], ['Sunday', 'Los domingos']];
  const SENS = { 1: '1 · Muy baja', 2: '2 · Baja', 3: '3 · Media-baja', 4: '4 · Media-alta', 5: '5 · Alta', 6: '6 · Muy alta' };
  const S = (title, fields, note) => ({ title, fields, note });
  const SCHEMA = (title, intro, sections) => ({ title, intro, sections });

  /** Esquema del bloque, o null si no hay uno hecho (se muestra todo en "Avanzado"). */
  function get(name){
    switch (name){
      case 'Detect.MotionDetect': return SCHEMA('Alarma de movimiento',
        'La cámara vigila la imagen y, si algo se mueve, hace lo que elijas abajo. Solo aparecen las opciones que tu cámara admite.', [
          S('Detección', [
            F('Enable', 'Detectar movimiento', 'Si lo apagas, la cámara no avisa ni graba por movimiento.', Toggle),
            F('Level', 'Sensibilidad', 'Con sensibilidad alta salta con cambios pequeños (insectos, luces, árboles); con baja, solo con movimientos claros.', Slider(1, 6, '', SENS))
          ]),
          S('Qué hace al detectar movimiento', handlerFields('movimiento'))]);
      case 'Detect.HumanDetection': return SCHEMA('Alarma de persona',
        'Igual que el movimiento, pero la cámara distingue a las personas de otros cambios en la imagen (si tu modelo lo soporta).', [
          S('Detección', [
            F('Enable', 'Detectar personas', 'Si lo apagas, no se generan alarmas de persona.', Toggle),
            F('Sensitivity', 'Sensibilidad', 'Más alto = detecta personas más lejanas o poco claras, con más falsas alarmas. El rango depende del modelo.', Num())
          ]),
          S('Qué hace al detectar una persona', handlerFields('una persona'))]);
      case 'Record': return SCHEMA('Grabación', 'Cómo y cuándo graba la cámara en la tarjeta SD.', [S(null, [
        F('RecordMode', 'Modo de grabación', '«Según horario» sigue el calendario de abajo (en Avanzado); «Grabar siempre» ignora el horario; «Apagada» no graba.',
          Choice([['ConfigRecord', 'Según horario'], ['ManualRecord', 'Grabar siempre'], ['ClosedRecord', 'Apagada']])),
        F('PacketLength', 'Duración de cada clip', 'Longitud de cada archivo grabado. Clips cortos son más fáciles de revisar y descargar.', Num('min')),
        F('PreRecord', 'Pre-grabación', 'Segundos de vídeo anteriores al evento que se añaden al principio del clip.', Num('s'))])]);
      case 'Simplify.Encode': return SCHEMA('Codificación de vídeo',
        'Calidad del vídeo. El flujo principal es el de alta calidad (se graba en la SD); el secundario es ligero y sirve para ver en directo con poca red.', [
          S('Flujo principal (alta calidad)', streamFields('MainFormat')),
          S('Flujo secundario (ligero)', streamFields('ExtraFormat'))]);
      case 'Camera.Param': return SCHEMA('Imagen', 'Orientación y comportamiento de la imagen. Los cambios se ven al momento en el directo.', [S(null, [
        F('PictureMirror', 'Espejo horizontal', 'Invierte la imagen de izquierda a derecha.', Toggle),
        F('PictureFlip', 'Voltear verticalmente', 'Pon la imagen boca abajo; útil si la cámara está instalada en el techo.', Toggle),
        F('BLCMode', 'Compensación de contraluz (BLC)', 'Aclara el sujeto cuando hay mucha luz detrás (ventanas, focos).', Toggle),
        F('RejectFlicker', 'Anti-parpadeo', 'Elige la frecuencia de tu red eléctrica para evitar bandas en el vídeo bajo luces artificiales.',
          Choice([['0', 'Apagado'], ['1', '50 Hz (Europa)'], ['2', '60 Hz (América)']]))])]);
      case 'Camera.ParamEx': return SCHEMA('Imagen: extras', 'Mejoras adicionales de la imagen. No todas las cámaras las incluyen.', [S(null, [
        F('BroadTrends', 'WDR (rango dinámico amplio)', 'Equilibra zonas muy claras y muy oscuras de la misma escena.', Toggle),
        F('LowLuxMode', 'Mejora con poca luz', 'Aumenta la sensibilidad en la oscuridad; puede añadir ruido.', Toggle),
        F('Dis', 'Estabilizador digital (DIS)', 'Reduce las vibraciones de la imagen.', Toggle),
        F('Ldc', 'Corrección de distorsión (LDC)', 'Corrige la deformación de las lentes gran angular.', Toggle),
        F('CorridorMode', 'Modo pasillo', 'Gira la imagen 90° para llenar pasillos o escaleras estrechas.', Toggle)])]);
      case 'AVEnc.VideoWidget': return SCHEMA('Texto en pantalla (OSD)', 'Rótulos que la cámara dibuja encima del vídeo (también en las grabaciones).', [S(null, [
        F('ChannelTitle.Name', 'Nombre mostrado', 'Texto que aparece en el vídeo como nombre de la cámara.', Str),
        F('ChannelTitleAttribute.EncodeBlend', 'Mostrar el nombre en el vídeo', 'Dibuja el nombre sobre la imagen.', Toggle),
        F('TimeTitleAttribute.EncodeBlend', 'Mostrar fecha y hora en el vídeo', 'Dibuja la fecha y la hora sobre la imagen.', Toggle)])]);
      case 'NetWork.NetEmail': return SCHEMA('Email (SMTP)',
        'Cuenta de correo desde la que la cámara envía avisos. Para que se envíen, activa «Enviar email» en la alarma de movimiento o de persona.', [S(null, [
          F('Enable', 'Enviar emails', 'Activa el envío de correos desde la cámara.', Toggle),
          F('Server.Name', 'Servidor SMTP', 'Dirección del servidor de correo saliente (p. ej. smtp.gmail.com).', Str),
          F('Server.Port', 'Puerto', 'Suele ser 465 con SSL o 587/25 sin SSL.', Num()),
          F('UseSSL', 'Conexión segura (SSL)', 'Cifra la conexión con el servidor. Actívala si tu servidor lo exige.', Toggle),
          F('Server.UserName', 'Usuario', 'Normalmente tu dirección de correo.', Str),
          F('Server.Password', 'Contraseña', 'Contraseña o clave de aplicación de esa cuenta.', Pass),
          F('SendAddr', 'Remitente', 'Dirección que aparece como remitente de los avisos.', Str),
          F('Recievers.0', 'Destinatario', 'Dirección que recibe los avisos.', Str),
          F('Title', 'Asunto', 'Asunto de los correos de aviso.', Str)])]);
      case 'NetWork.NetFTP': return SCHEMA('FTP',
        'Servidor al que la cámara sube fotos y vídeos de las alarmas. Para que se suban, activa «Subir fotos y vídeo a FTP» en la alarma.', [S(null, [
          F('Enable', 'Subir por FTP', 'Activa la subida de archivos.', Toggle),
          F('Server.Name', 'Servidor FTP', 'Dirección IP o nombre de tu servidor.', Str),
          F('Server.Port', 'Puerto', 'El estándar es 21.', Num()),
          F('Server.UserName', 'Usuario', 'Usuario del servidor FTP.', Str),
          F('Server.Password', 'Contraseña', 'Contraseña del servidor FTP.', Pass),
          F('Directory', 'Carpeta de destino', 'Carpeta del servidor donde se guardan los archivos.', Str),
          F('MaxFileLen', 'Tamaño máximo de archivo', 'Los archivos mayores no se suben.', Num('MB'))])]);
      case 'NetWork.NetCommon': return SCHEMA('Red',
        'Ajustes de red de la cámara. CUIDADO: cambiar puertos puede dejar la cámara inaccesible desde esta web y desde otros equipos.', [S(null, [
          F('HostName', 'Nombre en la red', 'Nombre con el que la cámara se anuncia en tu red.', Str),
          F('HttpPort', 'Puerto web (HTTP)', 'Puerto de la página web y de las capturas de imagen. Por defecto 80.', Num()),
          F('TCPPort', 'Puerto de control', 'Puerto del protocolo que usa este panel. Por defecto 34567; si lo cambias, hay que cambiarlo también en la ficha de la cámara.', Num()),
          F('UDPPort', 'Puerto de descubrimiento', 'Puerto UDP para encontrar cámaras en la red. Por defecto 34568.', Num()),
          F('MaxBps', 'Límite de ancho de banda', 'Tope de datos que envía la cámara.', Num('kbps'))])]);
      case 'NetWork.Wifi': return SCHEMA('WiFi',
        'Red inalámbrica de la cámara. Si cambias la red o la contraseña, la cámara se desconectará y tendrás que volver a encontrarla.', [S(null, [
          F('Enable', 'WiFi activado', 'Enciende o apaga la conexión inalámbrica.', Toggle),
          F('SSID', 'Nombre de la red', 'Nombre de tu red WiFi.', Str),
          F('Keys', 'Contraseña', 'Contraseña de tu red WiFi.', Pass)])]);
      case 'NetWork.NetNTP': return SCHEMA('Hora y NTP',
        'Mantiene el reloj de la cámara en hora (importante para que las grabaciones y alarmas tengan la hora correcta).', [S(null, [
          F('Enable', 'Sincronizar la hora por Internet', 'La cámara consulta un servidor de hora (NTP) para ajustar su reloj.', Toggle),
          F('Server.Name', 'Servidor de hora', 'Servidor NTP (p. ej. pool.ntp.org).', Str),
          F('UpdatePeriod', 'Sincronizar cada', 'Cada cuánto tiempo vuelve a ajustar el reloj.', Num('min'))])]);
      case 'StorageInfo': return SCHEMA('Almacenamiento (SD)',
        'Estado de la tarjeta SD (solo lectura). Para formatearla, usa el menú de la cámara o la app oficial.', []);
      case 'General.AutoMaintain': return SCHEMA('Mantenimiento automático', 'Tareas que la cámara hace sola para seguir funcionando bien.', [S(null, [
        F('AutoRebootDay', 'Reinicio automático', 'Reinicia la cámara con regularidad para evitar bloqueos.', Choice(DAYS)),
        F('AutoRebootHour', 'Hora del reinicio', 'Hora del día (0–23) en que se reinicia.', Slider(0, 23, ' h')),
        F('AutoDeleteFilesDays', 'Borrar grabaciones de más de', 'Días que se conservan las grabaciones. 0 = no borrar nunca (la SD se llenará y sobrescribirá).', Num('días'))])]);
      case 'General.Location': return SCHEMA('Idioma y fecha', 'Cómo muestra la cámara la fecha y la hora, y el idioma de su menú.', [S(null, [
        F('DateFormat', 'Formato de fecha', 'Orden de año, mes y día en el vídeo y en los rótulos.', Choice([['DDMMYY', 'Día-Mes-Año'], ['MMDDYY', 'Mes-Día-Año'], ['YYMMDD', 'Año-Mes-Día']])),
        F('TimeFormat', 'Formato de hora', 'Reloj de 24 horas o de 12 horas.', Choice([['24', '24 horas'], ['12', '12 horas']])),
        F('DSTRule', 'Horario de verano automático', 'Ajusta la hora en los cambios de verano/invierno.', Choice([['Off', 'No'], ['On', 'Sí']])),
        F('Language', 'Idioma del menú', 'Idioma del menú de la propia cámara (p. ej. Spanish, English).', Str)])]);
      case 'Uart.PTZ': return SCHEMA('PTZ (protocolo)',
        'Ajustes del motor de giro. Solo para cámaras con PTZ; si no tienes motor, no necesitas tocar nada.', []);
      default: return null;
    }
  }

  /** Bloques que se listan en Ajustes de la cámara: [título, descripción, bloque, filtro regex de ajustes visibles]. */
  const BLOCKS = [
    ['Alarma de movimiento', 'Qué hace la cámara al detectar movimiento: grabar, enviar email, sonar...', 'Detect.MotionDetect', 'Enable|EventHandler'],
    ['Alarma de persona', 'Acciones y sensibilidad cuando detecta una persona.', 'Detect.HumanDetection', 'Enable|EventHandler|Sensit'],
    ['Email (SMTP)', 'Servidor y cuenta para que la cámara envíe avisos por correo.', 'NetWork.NetEmail', null],
    ['FTP', 'Servidor donde la cámara sube fotos y vídeos de las alarmas.', 'NetWork.NetFTP', null],
    ['Codificación de vídeo', 'Resolución, calidad y fotogramas del flujo principal y secundario.', 'Simplify.Encode', null],
    ['Imagen', 'Brillo, contraste, espejo, giro y modo infrarrojo.', 'Camera.Param', null],
    ['Imagen: extras', 'WDR, poca luz, estabilizador, modo pasillo y corrección de distorsión.', 'Camera.ParamEx', null],
    ['Texto en pantalla (OSD)', 'Nombre y hora que se dibujan sobre el vídeo.', 'AVEnc.VideoWidget', null],
    ['Red', 'IP, puerta de enlace y puertos de la cámara.', 'NetWork.NetCommon', null],
    ['WiFi', 'Red inalámbrica a la que se conecta la cámara.', 'NetWork.Wifi', null],
    ['Hora y NTP', 'Zona horaria y sincronización automática de la hora.', 'NetWork.NetNTP', null],
    ['Grabación', 'Modo, duración y programación de las grabaciones en la SD.', 'Record', null],
    ['Almacenamiento (SD)', 'Capacidad, espacio libre y formateo de la tarjeta SD.', 'StorageInfo', null],
    ['Mantenimiento automático', 'Reinicio y borrado automático programados.', 'General.AutoMaintain', null],
    ['Idioma y fecha', 'Idioma del menú de la cámara y formato de fecha y hora.', 'General.Location', null],
    ['PTZ (protocolo)', 'Protocolo, dirección y velocidad del motor de giro.', 'Uart.PTZ', null]
  ];

  /** Nombres en español de claves técnicas habituales, para la lista "Avanzado". */
  const FRIENDLY = {
    Enable: 'Activado', Level: 'Nivel de sensibilidad', Sensitivity: 'Sensibilidad', RecordEnable: 'Grabar en la SD',
    SnapEnable: 'Hacer foto', MessageEnable: 'Enviar mensaje de alarma', MailEnable: 'Enviar email', FTPEnable: 'Subir a FTP',
    BeepEnable: 'Pitido de la cámara', RecordLatch: 'Segundos extra de grabación', EventLatch: 'Pausa entre avisos',
    TimeSection: 'Horario (día y franja)', Region: 'Zona de detección', MotionArea: 'Zona de movimiento',
    TotalSpace: 'Capacidad total (MB)', RemainSpace: 'Espacio libre (MB)', Status: 'Estado', Name: 'Nombre', Port: 'Puerto',
    UserName: 'Usuario', Password: 'Contraseña', SSID: 'Nombre de la red WiFi', Keys: 'Contraseña WiFi', Address: 'Dirección', Speed: 'Velocidad'
  };
  /** Nombre legible de una clave técnica: usa el diccionario o separa las mayúsculas ("RecordEnable" → "Record Enable"). */
  const friendly = last => FRIENDLY[last] || String(last).replace(/(?<=[a-z0-9])(?=[A-Z])/g, ' ');

  // ---- ayudas de ruta JSON (compartidas)
  /** Convierte "A.B.0.C" en ["A","B",0,"C"]. */
  const pathOf = key => key.split('.').map(p => /^\d+$/.test(p) ? parseInt(p, 10) : p);
  /** Valor simple (booleano, número o texto) en key dentro de base, o undefined. */
  function getPath(base, key){
    let cur = base;
    for (const p of pathOf(key)){
      if (cur === null || typeof cur !== 'object') return undefined;
      cur = cur[p];
      if (cur === undefined || cur === null) return undefined;
    }
    return (typeof cur === 'boolean' || typeof cur === 'number' || typeof cur === 'string') ? cur : undefined;
  }
  /** Escribe value en la ruta path del JSON root. */
  function setAt(root, path, value){
    let cur = root;
    for (const p of path.slice(0, -1)) cur = cur[p];
    cur[path[path.length - 1]] = value;
  }
  /** Recorre el JSON y recoge todos los valores simples con su ruta: [{path, orig}]. */
  function flatten(v, path, out){
    if (Array.isArray(v)) v.forEach((x, i) => flatten(x, [...path, i], out));
    else if (v !== null && typeof v === 'object') Object.keys(v).forEach(k => flatten(v[k], [...path, k], out));
    else if (typeof v === 'boolean' || typeof v === 'number' || typeof v === 'string') out.push({ path, orig: v });
  }
  const norm = v => String(v);
  /** Interpreta como activado/desactivado un booleano, un número (≠0) o un hexadecimal "0x…". */
  function toBool(v){
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'string'){ const n = parseInt(v.replace(/^0x/i, ''), 16); return Number.isNaN(n) ? v.toLowerCase() === 'true' : n !== 0; }
    return false;
  }
  /** Escribe un interruptor con el mismo formato que tenía el valor original (booleano, 0/1 o "0x0000000N"). */
  function boolLike(orig, on){
    if (typeof orig === 'boolean') return on;
    if (typeof orig === 'number') return on ? 1 : 0;
    if (typeof orig === 'string') return orig.startsWith('0x') ? '0x' + (on ? 1 : 0).toString(16).toUpperCase().padStart(8, '0') : String(on);
    return on;
  }
  /** Convierte el texto escrito al mismo tipo que tenía el valor original (undefined si no es válido). */
  function parseLike(orig, t){
    if (typeof orig === 'number'){
      if (t.trim() === '') return undefined;
      const n = Number(t); if (Number.isNaN(n)) return undefined;
      return Number.isInteger(orig) ? (Number.isInteger(n) ? n : undefined) : n;
    }
    return t;
  }

  return { get, BLOCKS, friendly, pathOf, getPath, setAt, flatten, norm, toBool, boolLike, parseLike };
})();
