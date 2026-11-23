/**
 * Diccionario en español de los ajustes de las cámaras XM (XmDic): nombre legible, para qué sirve y qué valores admite.
 * Si una clave no está en la lista, se genera un nombre traduciendo sus palabras y una descripción según su forma
 * (Enable, Mask, Port, Time…). Las claves se buscan primero con su bloque ("NetWork.NetDNS|Address") y luego solas.
 * Formato de cada entrada: clave: [título, descripción, valores posibles].
 */
window.XmDic = (function(){
  const SN = 'Sí / No (interruptor)';
  const CAN = 'Casillas por canal; ninguna marcada = ninguno';
  const D = {
    // ---- acciones ante un evento
    RecordEnable: ['Grabar en la tarjeta SD', 'Guarda un clip en la SD cuando ocurre el evento.', SN],
    SnapEnable: ['Hacer una foto', 'Guarda una foto en la SD cuando ocurre el evento.', SN],
    MessageEnable: ['Enviar mensaje de alarma', 'Avisa a las aplicaciones conectadas a la cámara (y a la nube del fabricante si está activa).', SN],
    MailEnable: ['Enviar email', 'Manda un correo al detectar el evento. Requiere configurar el email (SMTP).', SN],
    FTPEnable: ['Subir a FTP', 'Envía fotos o vídeo a tu servidor FTP. Requiere configurar el FTP.', SN],
    BeepEnable: ['Pitido de la cámara', 'Hace sonar el zumbador interno.', SN],
    AlarmOutEnable: ['Activar salida de alarma', 'Activa la salida de relé de la cámara (sirena, luz…), si tiene.', SN],
    AlarmOutMask: ['Salidas de alarma que activa', 'Qué salidas de alarma se activan con el evento.', CAN],
    AlarmOutLatch: ['Duración de la salida de alarma', 'Segundos que se mantiene activa la salida tras el evento.', 'Número entero de segundos (p. ej. 1 a 60)'],
    RecordMask: ['Canales que graban', 'Qué canales de vídeo graban al ocurrir el evento.', CAN],
    SnapshotMask: ['Canales que hacen foto', 'Qué canales hacen una foto al ocurrir el evento.', CAN],
    RecordLatch: ['Segundos extra de grabación', 'Cuánto sigue grabando después de que termine el evento.', 'Número entero de segundos (p. ej. 5 a 60)'],
    EventLatch: ['Pausa entre avisos', 'Tras un aviso, ignora nuevos eventos durante este tiempo para no repetirlos.', 'Número entero de segundos (p. ej. 0 a 60)'],
    Dejitter: ['Antirrebote', 'Tiempo mínimo entre dos eventos para considerarlos distintos.', 'Número entero de segundos (0 = sin filtro)'],
    LogEnable: ['Guardar en el registro', 'Anota el evento en el registro de la cámara.', SN],
    MMSEnable: ['Enviar MMS', 'Envía un aviso por MMS (casi nunca disponible).', SN],
    ShortMsgEnable: ['Enviar SMS', 'Envía un aviso por SMS (casi nunca disponible).', SN],
    TipEnable: ['Mostrar aviso en pantalla', 'Muestra un aviso en la pantalla local, si la cámara la tiene.', SN],
    TourEnable: ['Activar ronda', 'Inicia la ronda de vistas al ocurrir el evento (cámaras con varias vistas).', SN],
    TourMask: ['Canales de ronda', 'Canales que participan en la ronda.', CAN],
    MatrixEnable: ['Activar matriz de vídeo', 'Envía el vídeo a la salida de matriz (equipos con varias salidas).', SN],
    MatrixMask: ['Canales de matriz', 'Canales enviados a la matriz.', CAN],
    PtzEnable: ['Mover el PTZ', 'Mueve la cámara a una posición guardada al ocurrir el evento.', SN],
    AlarmInfo: ['Texto de la alarma', 'Texto libre que acompaña a la alarma. Puede dejarse vacío.', 'Texto (opcional)'],
    TimeSection: ['Horario', 'Franjas en las que está activo el ajuste. Cada fila es un día/franja: activo o no y hora de inicio y fin.', 'Activado/Desactivado y horas HH:MM de 00:00 a 24:00'],
    // ---- detección
    Level: ['Nivel de sensibilidad', 'Con nivel alto salta con cambios pequeños (insectos, luces); con nivel bajo solo con movimientos claros.', 'Entero de 1 (muy baja) a 6 (muy alta)'],
    Sensitivity: ['Sensibilidad', 'Qué tan fácil es que se dispare la detección. Más alto = más avisos, también falsos.', 'Número entero; el rango depende del modelo (habitual 1 a 10)'],
    Region: ['Zona de detección', 'Zonas de la imagen que se vigilan.', 'Cuadrícula de bits; se edita mejor desde la app de la cámara'],
    MotionArea: ['Zona de movimiento', 'Zonas de la imagen que se vigilan.', 'Cuadrícula de bits; se edita mejor desde la app de la cámara'],
    Threshold: ['Umbral', 'Cantidad mínima de cambio para considerar que hay un evento.', 'Número entero'],
    // ---- vídeo
    Resolution: ['Resolución', 'Tamaño de la imagen. Más grande = más detalle y más datos.', 'Según el modelo: p. ej. 1080P, 720P, D1, CIF'],
    FPS: ['Fotogramas por segundo', 'Más fotogramas = movimiento más fluido, pero más datos y más espacio en la SD.', 'Número entero (habitual 1 a 25)'],
    BitRate: ['Caudal de vídeo', 'Datos por segundo. Más caudal = mejor calidad y más espacio ocupado.', 'Número entero en kbps (p. ej. 512 a 8192)'],
    Quality: ['Calidad', 'Calidad de la compresión. Solo actúa con caudal variable.', 'Entero de 1 (más baja) a 6 (más alta)'],
    BitRateControl: ['Tipo de caudal', 'Constante mantiene el mismo caudal; variable lo adapta a la escena.', 'CBR (constante) o VBR (variable)'],
    Gop: ['Intervalo de fotograma clave', 'Cada cuántos fotogramas hay uno completo. Más bajo = se salta mejor en el vídeo, pero pesa más.', 'Número entero (habitual 1 a 5 segundos)'],
    Compression: ['Códec', 'Formato de compresión del vídeo.', 'H.264, H.265… (según el modelo)'],
    AudioEnable: ['Incluir audio', 'Graba y transmite el sonido del micrófono de la cámara.', SN],
    VideoEnable: ['Incluir vídeo', 'Activa el flujo de vídeo.', SN],
    // ---- imagen
    PictureFlip: ['Voltear verticalmente', 'Pone la imagen boca abajo; útil si la cámara va en el techo.', SN],
    PictureMirror: ['Espejo horizontal', 'Invierte la imagen de izquierda a derecha.', SN],
    BLCMode: ['Compensación de contraluz (BLC)', 'Aclara el sujeto cuando hay mucha luz detrás.', SN],
    RejectFlicker: ['Anti-parpadeo', 'Elige la frecuencia de tu red eléctrica para evitar bandas con luz artificial.', '0 = apagado, 1 = 50 Hz (Europa), 2 = 60 Hz (América)'],
    DayNightColor: ['Visión día/noche', 'Cómo cambia entre color e infrarrojos.', 'Según el modelo (p. ej. automático, color, blanco y negro)'],
    AeSensitivity: ['Sensibilidad de exposición', 'Qué rápido reacciona la cámara a los cambios de luz.', 'Número entero'],
    ExposureTime: ['Tiempo de exposición', 'Cuánto tiempo capta luz cada fotograma.', 'Número entero (microsegundos o nivel, según el modelo)'],
    BroadTrends: ['WDR (rango dinámico amplio)', 'Equilibra zonas muy claras y muy oscuras de la misma escena.', SN],
    LowLuxMode: ['Mejora con poca luz', 'Aumenta la sensibilidad en la oscuridad; puede añadir ruido.', SN],
    Dis: ['Estabilizador digital (DIS)', 'Reduce las vibraciones de la imagen.', SN],
    Ldc: ['Corrección de distorsión (LDC)', 'Corrige la deformación de las lentes gran angular.', SN],
    CorridorMode: ['Modo pasillo', 'Gira la imagen 90° para llenar pasillos o escaleras estrechas.', SN],
    // ---- texto en pantalla
    EncodeBlend: ['Mostrar en el vídeo', 'Dibuja este rótulo sobre la imagen grabada y transmitida.', SN],
    FrontColor: ['Color del texto', 'Color con el que se dibuja el rótulo.', 'Número de color interno (p. ej. 0xFFFFFFFF = blanco)'],
    BackColor: ['Color de fondo del texto', 'Color detrás del rótulo.', 'Número de color interno'],
    // ---- red
    HostIP: ['Dirección IP', 'Dirección de la cámara en tu red. No debe usarla otro dispositivo.', 'IPv4: cuatro números de 0 a 255 (192.168.1.50)'],
    Submask: ['Máscara de subred', 'Define qué direcciones son de tu red local. Casi siempre 255.255.255.0.', 'IPv4: cuatro números de 0 a 255'],
    GateWay: ['Puerta de enlace', 'La IP de tu router, por donde la cámara sale a otras redes.', 'IPv4: cuatro números de 0 a 255'],
    HostName: ['Nombre en la red', 'Nombre con el que la cámara se anuncia en tu red.', 'Texto sin espacios (hasta 32 caracteres)'],
    HttpPort: ['Puerto web (HTTP)', 'Puerto de la página web y de las capturas de imagen. Por defecto 80.', 'Número de 1 a 65535'],
    TCPPort: ['Puerto de control', 'Puerto del protocolo que usa este panel. Por defecto 34567. Si lo cambias, cámbialo también en la ficha de la cámara.', 'Número de 1 a 65535'],
    UDPPort: ['Puerto de descubrimiento', 'Puerto UDP para encontrar cámaras en la red. Por defecto 34568.', 'Número de 1 a 65535'],
    SSLPort: ['Puerto seguro (HTTPS)', 'Puerto de la conexión cifrada. Por defecto 8443.', 'Número de 1 a 65535'],
    MaxBps: ['Límite de ancho de banda', 'Tope de datos que envía la cámara por la red.', 'Número entero en kbps (0 = sin límite)'],
    TCPMaxConn: ['Conexiones simultáneas máximas', 'Cuántos clientes pueden conectarse a la vez a la cámara.', 'Número entero (habitual 1 a 20)'],
    MonMode: ['Modo de transmisión', 'Cómo se envía el vídeo en directo por la red.', 'TCP, UDP o multidifusión (según el modelo)'],
    TransferPlan: ['Prioridad de transmisión', 'Qué se prefiere cuando la red va justa: fluidez o calidad.', 'Número interno (0 = automático)'],
    UseHSDownLoad: ['Descarga de alta velocidad', 'Permite descargar las grabaciones de la SD más rápido.', SN],
    DvrMac: ['Dirección MAC', 'Identificador físico de la tarjeta de red de la cámara (solo lectura).', 'No editable'],
    MAC: ['Dirección MAC', 'Identificador físico de la tarjeta de red de la cámara (solo lectura).', 'No editable'],
    'NetWork.NetDNS|Address': ['DNS principal', 'Servidor que traduce nombres de internet a direcciones. Suele ser tu router, 8.8.8.8 o 1.1.1.1.', 'IPv4: cuatro números de 0 a 255'],
    'NetWork.NetDNS|SpareAddress': ['DNS secundario', 'Servidor de reserva si el principal falla (opcional).', 'IPv4: cuatro números de 0 a 255'],
    Interface: ['Interfaz de red', 'A qué conexión se aplica: eth0 es el cable y wlan0 el Wi‑Fi (solo lectura).', 'eth0 o wlan0'],
    SSID: ['Nombre de la red Wi‑Fi', 'Nombre de tu red inalámbrica.', 'Texto (hasta 32 caracteres)'],
    Keys: ['Contraseña del Wi‑Fi', 'Clave de tu red inalámbrica.', 'Texto (8 a 63 caracteres)'],
    AuthMode: ['Seguridad del Wi‑Fi', 'Tipo de protección de la red Wi‑Fi.', 'Según el router (p. ej. WPA2-PSK)'],
    EncrypType: ['Cifrado del Wi‑Fi', 'Algoritmo de cifrado de la red Wi‑Fi.', 'Según el router (p. ej. AES, TKIP)'],
    Channel: ['Canal', 'Canal de radio del Wi‑Fi o del vídeo, según el bloque.', 'Número entero (Wi‑Fi 1 a 13)'],
    UseSSL: ['Conexión segura (SSL)', 'Cifra la conexión con el servidor. Actívalo si tu servidor lo exige.', SN],
    Directory: ['Carpeta de destino', 'Carpeta del servidor FTP donde se guardan los archivos.', 'Texto (ruta, p. ej. /camara1)'],
    MaxFileLen: ['Tamaño máximo de archivo', 'Los archivos mayores no se suben.', 'Número entero en MB'],
    SendAddr: ['Remitente', 'Dirección que aparece como remitente de los avisos.', 'Dirección de email'],
    Recievers: ['Destinatarios', 'Direcciones que reciben los avisos.', 'Direcciones de email'],
    Title: ['Asunto', 'Asunto de los correos de aviso.', 'Texto'],
    UpdatePeriod: ['Sincronizar cada', 'Cada cuánto tiempo vuelve a ajustar el reloj.', 'Número entero en minutos'],
    'Server.Name': ['Servidor', 'Dirección IP o nombre del servidor.', 'Texto (IP o nombre)'],
    'Server.Port': ['Puerto del servidor', 'Puerto al que se conecta la cámara.', 'Número de 1 a 65535'],
    'Server.UserName': ['Usuario del servidor', 'Usuario con el que la cámara inicia sesión.', 'Texto'],
    'Server.Password': ['Contraseña del servidor', 'Contraseña con la que la cámara inicia sesión.', 'Texto'],
    UserName: ['Usuario', 'Nombre de usuario.', 'Texto'],
    Password: ['Contraseña', 'Contraseña de la cuenta.', 'Texto'],
    Anonymity: ['Acceso anónimo', 'Conecta sin usuario ni contraseña.', SN],
    // ---- grabación y sistema
    RecordMode: ['Modo de grabación', '«Según horario» sigue el calendario; «Grabar siempre» ignora el horario; «Apagada» no graba.', 'ConfigRecord (según horario), ManualRecord (siempre), ClosedRecord (apagada)'],
    PacketLength: ['Duración de cada clip', 'Longitud de cada archivo grabado.', 'Número entero en minutos (habitual 1 a 60)'],
    PreRecord: ['Pre-grabación', 'Segundos de vídeo anteriores al evento que se añaden al clip.', 'Número entero de segundos (0 a 30)'],
    Redundancy: ['Grabación redundante', 'Guarda una copia de las grabaciones en una segunda unidad.', SN],
    AutoRebootDay: ['Reinicio automático', 'Cuándo se reinicia sola la cámara para evitar bloqueos.', 'Never, Everyday, Monday… Sunday'],
    AutoRebootHour: ['Hora del reinicio', 'Hora del día en que se reinicia.', 'Entero de 0 a 23'],
    AutoDeleteFilesDays: ['Borrar grabaciones de más de', 'Días que se conservan las grabaciones. 0 = no borrar nunca.', 'Número entero de días (0 = nunca)'],
    DateFormat: ['Formato de fecha', 'Orden de año, mes y día en el vídeo y los rótulos.', 'DDMMYY, MMDDYY o YYMMDD'],
    DateSeparator: ['Separador de fecha', 'Carácter entre día, mes y año.', 'Un carácter (/ - .)'],
    TimeFormat: ['Formato de hora', 'Reloj de 24 o de 12 horas.', '24 o 12'],
    DSTRule: ['Horario de verano automático', 'Ajusta la hora en los cambios de verano/invierno.', 'On (sí) / Off (no)'],
    Language: ['Idioma del menú', 'Idioma del menú de la propia cámara.', 'Texto (p. ej. Spanish, English)'],
    LocalNo: ['Número de dispositivo', 'Identificador del equipo.', 'Número entero'],
    MachineName: ['Nombre del equipo', 'Nombre interno del dispositivo.', 'Texto'],
    VideoOutPut: ['Estándar de vídeo', 'Sistema de vídeo analógico de salida.', 'PAL o NTSC'],
    OverWrite: ['Sobrescribir al llenarse', 'Al llenarse la SD, borra lo más antiguo para seguir grabando.', 'OverWrite (sí) / StopRecord (parar)'],
    // ---- PTZ
    Protocol: ['Protocolo del motor', 'Lenguaje con el que se controla el motor de giro.', 'Según el modelo (p. ej. PELCOD, PELCOP)'],
    'Uart.PTZ|Address': ['Dirección del motor', 'Número que identifica al motor PTZ en el bus.', 'Número entero (1 a 255)'],
    Speed: ['Velocidad', 'Velocidad del movimiento.', 'Número entero; el rango depende del modelo'],
    BaudRate: ['Velocidad del puerto serie', 'Velocidad de comunicación con el motor.', 'Número (p. ej. 2400, 9600)'],
    DataBits: ['Bits de datos', 'Parámetro del puerto serie.', 'Entero de 5 a 8'],
    StopBits: ['Bits de parada', 'Parámetro del puerto serie.', '1 o 2'],
    Parity: ['Paridad', 'Parámetro del puerto serie.', 'None, Odd o Even'],
    // ---- grupos (títulos de sección)
    EventHandler: ['Acciones al ocurrir el evento', 'Qué hace la cámara cuando se produce el evento.', ''],
    MainFormat: ['Flujo principal (alta calidad)', 'Flujo de vídeo que se graba en la SD.', ''],
    ExtraFormat: ['Flujo secundario (ligero)', 'Flujo de vídeo reducido para ver en directo con poca red.', ''],
    // ---- genéricos
    Enable: ['Activado', 'Activa o desactiva esta función.', SN],
    Name: ['Nombre', 'Nombre de este elemento.', 'Texto'],
    Port: ['Puerto', 'Puerto de red.', 'Número de 1 a 65535'],
    Address: ['Dirección', 'Dirección del dispositivo.', 'Según el bloque'],
    Status: ['Estado', 'Estado actual (solo lectura).', 'No editable'],
    TotalSpace: ['Capacidad total', 'Espacio total de la tarjeta (solo lectura).', 'No editable (MB)'],
    RemainSpace: ['Espacio libre', 'Espacio libre de la tarjeta (solo lectura).', 'No editable (MB)']
  };

  /** Palabras sueltas para traducir claves que no están en el diccionario ("AlarmOutLatch" → "Alarma Salida Duración"). */
  const W = { Enable: 'activar', Disable: 'desactivar', Alarm: 'alarma', Out: 'salida', In: 'entrada', Mask: 'canales', Latch: 'duración', Time: 'hora', Section: 'horario', Record: 'grabación',
    Snap: 'foto', Snapshot: 'foto', Mail: 'email', Message: 'mensaje', Event: 'evento', Handler: 'acciones', Detect: 'detección', Motion: 'movimiento', Human: 'persona', Blind: 'ocultación',
    Loss: 'pérdida de vídeo', Video: 'vídeo', Audio: 'audio', Format: 'formato', Main: 'principal', Extra: 'secundario', Rate: 'tasa', Bit: 'bits', Frame: 'fotograma', Quality: 'calidad',
    Level: 'nivel', Mode: 'modo', Type: 'tipo', Size: 'tamaño', Length: 'longitud', Max: 'máximo', Min: 'mínimo', Num: 'número', Number: 'número', Count: 'cantidad', Period: 'periodo', Interval: 'intervalo',
    Delay: 'retardo', Timeout: 'tiempo de espera', Server: 'servidor', Host: 'equipo', Port: 'puerto', User: 'usuario', Name: 'nombre', Pass: 'contraseña', Password: 'contraseña', Key: 'clave', Keys: 'clave',
    Net: 'red', Network: 'red', Wifi: 'Wi‑Fi', Ftp: 'FTP', FTP: 'FTP', Ntp: 'NTP', NTP: 'NTP', Dns: 'DNS', DNS: 'DNS', Dhcp: 'DHCP', DHCP: 'DHCP', Ip: 'IP', IP: 'IP', Mac: 'MAC', MAC: 'MAC',
    Http: 'HTTP', HTTP: 'HTTP', Tcp: 'TCP', TCP: 'TCP', Udp: 'UDP', UDP: 'UDP', Ssl: 'SSL', SSL: 'SSL', Rtsp: 'RTSP', RTSP: 'RTSP', Onvif: 'ONVIF', Upnp: 'UPnP', UPNP: 'UPnP', Ddns: 'DDNS', DDNS: 'DDNS',
    Camera: 'cámara', Channel: 'canal', Title: 'título', Color: 'color', Brightness: 'brillo', Contrast: 'contraste', Saturation: 'saturación', Hue: 'tono', Gain: 'ganancia', Exposure: 'exposición',
    White: 'blanco', Balance: 'balance', Flip: 'volteo', Mirror: 'espejo', Day: 'día', Night: 'noche', Auto: 'automático', Manual: 'manual', Date: 'fecha', Language: 'idioma', Location: 'ubicación',
    Zone: 'zona', Daylight: 'horario de verano', Sync: 'sincronizar', Update: 'actualizar', Upgrade: 'actualizar', Reboot: 'reinicio', Maintain: 'mantenimiento', Delete: 'borrar', Files: 'archivos', Days: 'días',
    Storage: 'almacenamiento', Space: 'espacio', Disk: 'disco', Total: 'total', Remain: 'libre', Free: 'libre', Format2: 'formato', Log: 'registro', Info: 'información', Version: 'versión', Serial: 'serie',
    Display: 'pantalla', Show: 'mostrar', Hide: 'ocultar', Text: 'texto', Font: 'fuente', Pos: 'posición', Position: 'posición', Rect: 'rectángulo', Area: 'zona', Region: 'región', Sensitivity: 'sensibilidad',
    Threshold: 'umbral', Trigger: 'disparo', Link: 'enlace', Preset: 'posición guardada', Tour: 'ronda', Speed: 'velocidad', Zoom: 'zoom', Focus: 'foco', Iris: 'iris', Pan: 'giro', Tilt: 'inclinación',
    Beep: 'pitido', Buzzer: 'zumbador', Light: 'luz', Led: 'LED', IR: 'infrarrojos', Ircut: 'filtro IR', Cut: 'corte', Filter: 'filtro', Black: 'negro', List: 'lista', Allow: 'permitir', Deny: 'denegar',
    Use: 'usar', Is: 'es', Has: 'tiene', Default: 'por defecto', Current: 'actual', Real: 'real', Stream: 'flujo', Encode: 'codificación', Decode: 'decodificación', Param: 'parámetros', Ex: 'extra',
    Local: 'local', Remote: 'remoto', Cloud: 'nube', Spare: 'reserva', Address: 'dirección', Addr: 'dirección', Mask2: 'máscara', Sub: 'sub', Gate: 'puerta', Way: 'enlace', Anonymity: 'anónimo' };
  const capital = s => s.charAt(0).toUpperCase() + s.slice(1);
  const trozos = k => String(k).split(/(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/);

  /** Busca la entrada para el bloque `blq` y la clave `last` (primero con bloque, luego sola). */
  function buscar(blq, last){
    const b = String(blq || '').replace(/\.\[0\]$/, '');
    return D[b + '|' + last] || D[last] || null;
  }
  /** Traduce una clave sin entrada: separa las palabras y las pasa al español. */
  function traducir(last){
    const s = String(last); if (/^\d+$/.test(s)) return String(Number(s) + 1);
    const m = /^(.+)Enable$/.exec(s); if (m) return 'Activar ' + traducir(m[1]).toLowerCase();
    const t = trozos(s).map(x => W[x] || x.toLowerCase());
    return capital(t.join(' '));
  }
  /** Nombre en español de una clave (para listas, mensajes y comparaciones). */
  function nombre(blq, last){ const e = buscar(blq, last); return e ? e[0] : traducir(last); }
  /** Descripción de lo que hace un ajuste, ajustada a su forma si no hay entrada. */
  function descripcion(blq, last, v){
    const e = buscar(blq, last); if (e) return e[1];
    const s = String(last), n = nombre(blq, last).toLowerCase();
    if (/Enable$/.test(s)) return `Activa o desactiva: ${n.replace(/^activar\s*/, '')}.`;
    if (/Mask$/.test(s)) return 'Indica a qué canales (cámaras) se aplica. Ninguno marcado = a ninguno.';
    if (/Latch$/.test(s)) return 'Tiempo que se mantiene activo tras el evento.';
    if (/Port$/.test(s)) return 'Puerto de red usado por este servicio.';
    if (/(Time|Period|Interval|Delay)/.test(s)) return 'Parámetro de tiempo de la cámara.';
    if (/(IP|Addr|Address|Gateway|GateWay)$/.test(s)) return 'Dirección de red.';
    if (/Name$/.test(s)) return 'Nombre o identificador.';
    return 'Ajuste técnico del fabricante. Si no sabes qué hace, mejor no lo cambies.';
  }
  /** Valores posibles: los de la entrada o, si no la hay, los deducidos del tipo del valor actual. */
  function valores(blq, last, v, tipo){
    const e = buscar(blq, last); if (e) return e[2];
    switch (tipo){
      case 'bool': return SN;
      case 'iphex': case 'ip': return 'IPv4: cuatro números de 0 a 255 (192.168.1.50)';
      case 'mask': return CAN;
      case 'time': return 'Activado/Desactivado y horas HH:MM de 00:00 a 24:00';
      case 'hex': return 'Número entero (0 o mayor)';
      case 'num': return /Port$/.test(String(last)) ? 'Número de 1 a 65535' : 'Número entero; el rango depende del modelo';
      default: return typeof v === 'string' && v === '' ? 'Texto (puede quedar vacío)' : 'Texto';
    }
  }
  /** Etiqueta completa de una ruta: "Acciones › Grabar en la tarjeta SD". */
  function etiqueta(blq, path){
    const p = path.filter(x => !/^\d+$/.test(String(x)));
    const idx = path.filter((x, i) => /^\d+$/.test(String(x)) && i > 0).map(x => Number(x) + 1);
    return p.map((x, i) => i === p.length - 1 ? nombre(blq, x) : (D[x] ? D[x][0] : traducir(x))).join(' › ') + (idx.length ? ' ' + idx.join('.') : '');
  }
  return { nombre, descripcion, valores, etiqueta, traducir, buscar, SN };
})();
