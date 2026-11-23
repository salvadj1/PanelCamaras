using System;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Net;
using System.Net.Http;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Threading.Tasks;
using CentroSeguridad.Models;
using CentroSeguridad.Services;
using CentroSeguridad.Services.Xm;
using Microsoft.AspNetCore.Mvc;

namespace CentroSeguridad.Controllers
{
    /// <summary>Datos para crear una cámara desde la web.</summary>
    public class NuevaCamaraDto
    {
        public string Nombre { get; set; }
        public string Host { get; set; }
        public int Puerto { get; set; } = 34567;
        public string Usuario { get; set; } = "admin";
        public string Password { get; set; } = "";
        public int PuertoRtsp { get; set; } = 554;
        public int PuertoHttp { get; set; } = 80;
        public int Canal { get; set; }
        public bool RtspHash { get; set; }
        /// <summary>true = comprobar el login antes de guardar.</summary>
        public bool Probar { get; set; }
    }

    /// <summary>Orden de movimiento PTZ (cmd null = parar).</summary>
    public class PtzDto
    {
        public string Cmd { get; set; }
        public int Step { get; set; } = 5;
        public long Seq { get; set; }
    }

    /// <summary>Orden de preset (GotoPreset / SetPreset).</summary>
    public class PresetDto
    {
        public string Cmd { get; set; }
        public int N { get; set; }
    }

    /// <summary>Cambios parciales de una cámara (los campos null no se tocan).</summary>
    public class EditarCamaraDto
    {
        public string Nombre { get; set; }
        public bool? Vigilar { get; set; }
        public bool? RtspHash { get; set; }
        // Conexión (cambio de IP, puertos o credenciales). Password vacío o null = se conserva la actual.
        public string Host { get; set; }
        public int? Puerto { get; set; }
        public string Usuario { get; set; }
        public string Password { get; set; }
        public int? PuertoRtsp { get; set; }
        public int? PuertoHttp { get; set; }
        public int? Canal { get; set; }
        /// <summary>true = comprobar el login con los datos nuevos antes de guardar.</summary>
        public bool Probar { get; set; }
    }

    /// <summary>API JSON de cámaras: lista/estado, alta/baja, búsqueda en red, diagnóstico, PTZ, presets y capturas.</summary>
    [ApiController]
    [Route("api/camaras")]
    public class CamarasApiController : ControllerBase
    {
        private static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromSeconds(6) };
        private readonly AlmacenCamaras _almacen;
        private readonly EstadoCamaras _estado;
        private readonly PtzService _ptz;
        private readonly Go2RtcService _go2rtc;
        private readonly ControlCamaras _control;
        private static readonly Regex NombreBloque = new Regex(@"^[A-Za-z0-9_.\[\]]{1,64}$", RegexOptions.Compiled);

        public CamarasApiController(AlmacenCamaras almacen, EstadoCamaras estado, PtzService ptz, Go2RtcService go2rtc, ControlCamaras control)
        {
            _almacen = almacen; _estado = estado; _ptz = ptz; _go2rtc = go2rtc; _control = control;
        }

        /// <summary>GET /api/camaras: cámaras (sin contraseña) con su estado y el estado del motor de vídeo.</summary>
        [HttpGet("")]
        public IActionResult Lista()
        {
            var camaras = _almacen.Listar().Select(c => new
            {
                c.Id, c.Nombre, c.Host, c.Puerto, c.Usuario, c.Canal, c.PuertoRtsp, c.PuertoHttp, c.RtspHash, c.Vigilar,
                online = _estado.EsOnline(c.Id)
            });
            return Ok(new { camaras, video = new { disponible = _go2rtc.Disponible, mensaje = _go2rtc.Mensaje, audio = _go2rtc.FfmpegDisponible } });
        }

        /// <summary>POST /api/camaras: añade una cámara (opcionalmente probando antes el login).</summary>
        [HttpPost("")]
        public async Task<IActionResult> Agregar([FromBody] NuevaCamaraDto d)
        {
            if (d == null || string.IsNullOrWhiteSpace(d.Host)) return BadRequest(new { error = "Falta la IP de la cámara" });
            var cam = new CamaraXm
            {
                Nombre = string.IsNullOrWhiteSpace(d.Nombre) ? d.Host.Trim() : d.Nombre.Trim(),
                Host = d.Host.Trim(), Puerto = d.Puerto, Usuario = d.Usuario ?? "admin", Password = d.Password ?? "",
                PuertoRtsp = d.PuertoRtsp, PuertoHttp = d.PuertoHttp, Canal = d.Canal, RtspHash = d.RtspHash
            };
            if (d.Probar)
            {
                try
                {
                    await Task.Run(() => { using (var c = new DvripClient(cam.Host, cam.Puerto)) c.Login(cam.Usuario, cam.Password); });
                }
                catch (Exception e)
                {
                    return BadRequest(new { error = "No se pudo conectar: " + e.Message + ". Prueba el diagnóstico." });
                }
            }
            _almacen.Agregar(cam);
            return Ok(new { cam.Id });
        }

        /// <summary>DELETE /api/camaras/{id}: borra una cámara.</summary>
        [HttpDelete("{id}")]
        public IActionResult Borrar(string id) => _almacen.Eliminar(id) ? Ok() : NotFound();

        /// <summary>POST /api/camaras/buscar: busca cámaras XM en la red del servidor (UDP 34569).</summary>
        [HttpPost("buscar")]
        public async Task<IActionResult> Buscar()
        {
            try { return Ok(await Task.Run(() => XmDiscovery.Scan())); }
            catch (Exception e) { return BadRequest(new { error = "Error al buscar: " + e.Message }); }
        }

        /// <summary>POST /api/camaras/diagnostico: diagnóstico de conexión por capas.</summary>
        [HttpPost("diagnostico")]
        public async Task<IActionResult> Diagnostico([FromBody] NuevaCamaraDto d)
        {
            if (d == null || string.IsNullOrWhiteSpace(d.Host)) return BadRequest(new { error = "Falta la IP" });
            var lineas = await Task.Run(() => XmDiagnostics.Run(d.Host.Trim(), d.Puerto, d.Usuario ?? "admin", d.Password ?? "", d.PuertoHttp, d.PuertoRtsp));
            return Ok(lineas);
        }

        /// <summary>
        /// PATCH /api/camaras/{id}: cambia nombre, vigilancia, RTSP con hash y/o los datos de conexión (IP, puertos,
        /// usuario, contraseña, canal). Con <c>Probar</c> se comprueba el login con los datos nuevos antes de guardar.
        /// </summary>
        [HttpPatch("{id}")]
        public async Task<IActionResult> Editar(string id, [FromBody] EditarCamaraDto d)
        {
            var actual = _almacen.Obtener(id);
            if (actual == null) return NotFound();
            if (d.Nombre != null && string.IsNullOrWhiteSpace(d.Nombre)) return BadRequest(new { error = "El nombre no puede estar vacío" });
            if (d.Host != null && string.IsNullOrWhiteSpace(d.Host)) return BadRequest(new { error = "Falta la IP" });
            if ((d.Puerto ?? 1) < 1 || (d.PuertoRtsp ?? 1) < 1 || (d.PuertoHttp ?? 1) < 1 || (d.Canal ?? 0) < 0) return BadRequest(new { error = "Puerto o canal no válido" });
            string host = d.Host?.Trim() ?? actual.Host;
            int puerto = d.Puerto ?? actual.Puerto;
            string usuario = string.IsNullOrWhiteSpace(d.Usuario) ? actual.Usuario : d.Usuario.Trim();
            string clave = string.IsNullOrEmpty(d.Password) ? actual.Password : d.Password;
            if (d.Probar)
            {
                try { await Task.Run(() => { using (var c = new DvripClient(host, puerto)) c.Login(usuario, clave); }); }
                catch (Exception e) { return BadRequest(new { error = "No se pudo conectar con los datos nuevos: " + e.Message }); }
            }
            _almacen.Actualizar(id, c =>
            {
                if (d.Nombre != null) c.Nombre = d.Nombre.Trim();
                if (d.Vigilar.HasValue) c.Vigilar = d.Vigilar.Value;
                if (d.RtspHash.HasValue) c.RtspHash = d.RtspHash.Value;
                c.Host = host; c.Puerto = puerto; c.Usuario = usuario; c.Password = clave;
                if (d.PuertoRtsp.HasValue) c.PuertoRtsp = d.PuertoRtsp.Value;
                if (d.PuertoHttp.HasValue) c.PuertoHttp = d.PuertoHttp.Value;
                if (d.Canal.HasValue) c.Canal = d.Canal.Value;
            });
            return Ok();
        }

        /// <summary>Convierte "0x0A01A8C0" (hex little-endian de las cámaras XM) en "192.168.1.10"; devuelve el texto original si no es hex.</summary>
        private static string HexAIp(string hex)
        {
            if (string.IsNullOrEmpty(hex)) return "";
            string h = hex.StartsWith("0x", StringComparison.OrdinalIgnoreCase) ? hex.Substring(2) : hex;
            if (!uint.TryParse(h, System.Globalization.NumberStyles.HexNumber, System.Globalization.CultureInfo.InvariantCulture, out uint v)) return hex;
            return (v & 0xFF) + "." + ((v >> 8) & 0xFF) + "." + ((v >> 16) & 0xFF) + "." + ((v >> 24) & 0xFF);
        }

        /// <summary>Datos de red de la cámara (MAC, IP, máscara, puerta de enlace, nombre) del bloque NetWork.NetCommon; null si no se pueden leer.</summary>
        private static object LeerRed(DvripClient c)
        {
            try
            {
                string raw = c.GetConfigRaw("NetWork.NetCommon");
                if (string.IsNullOrEmpty(raw) || raw == "null") return null;
                using (var doc = System.Text.Json.JsonDocument.Parse(raw))
                {
                    var n = doc.RootElement;
                    if (n.ValueKind == System.Text.Json.JsonValueKind.Array && n.GetArrayLength() > 0) n = n[0];
                    if (n.ValueKind != System.Text.Json.JsonValueKind.Object) return null;
                    return new
                    {
                        mac = DvripClient.GetString(n, "MAC"),
                        ip = HexAIp(DvripClient.GetString(n, "HostIP")),
                        mascara = HexAIp(DvripClient.GetString(n, "Submask")),
                        puerta = HexAIp(DvripClient.GetString(n, "GateWay")),
                        nombre = DvripClient.GetString(n, "HostName")
                    };
                }
            }
            catch (Exception) { return null; }
        }

        /// <summary>GET /api/camaras/{id}/info: información de sistema, red (MAC, IP…) y hora de la cámara.</summary>
        [HttpGet("{id}/info")]
        public async Task<IActionResult> Info(string id)
        {
            if (_almacen.Obtener(id) == null) return NotFound();
            try
            {
                var r = await _control.EjecutarAsync(id, c =>
                {
                    var si = c.SystemInfo();
                    string hora; try { hora = c.GetTime(); } catch (Exception) { hora = "?"; }
                    return new { sistema = si, hora, red = LeerRed(c) };
                });
                return Ok(r);
            }
            catch (Exception e) { return BadRequest(new { error = e.Message }); }
        }

        /// <summary>
        /// Lee un bloque de configuración. Muchas cámaras XM guardan algunos bloques por canal: si el nombre sin índice no
        /// devuelve datos, se reintenta con ".[0]" (canal 0). Devuelve el nombre que funcionó y el JSON en bruto.
        /// </summary>
        private static (string, string) LeerConIndice(DvripClient c, string name)
        {
            string raw = null; Exception fallo = null;
            try { raw = c.GetConfigRaw(name); } catch (Exception e) { fallo = e; }
            if ((raw == null || raw == "null") && !name.EndsWith("]"))
            {
                string conIdx = name + ".[0]";
                try { string r2 = c.GetConfigRaw(conIdx); if (r2 != null && r2 != "null") return (conIdx, r2); } catch (Exception) { }
            }
            if (fallo != null) throw fallo;
            return (name, raw);
        }

        /// <summary>GET /api/camaras/{id}/config?name=X: bloque de configuración de la cámara (JSON tal cual).</summary>
        [HttpGet("{id}/config")]
        public async Task<IActionResult> LeerConfig(string id, [FromQuery] string name)
        {
            if (string.IsNullOrEmpty(name) || !NombreBloque.IsMatch(name)) return BadRequest(new { error = "Nombre de bloque no válido" });
            if (_almacen.Obtener(id) == null) return NotFound();
            try
            {
                var r = await _control.EjecutarAsync(id, c => LeerConIndice(c, name));
                Response.Headers["X-Config-Name"] = r.Item1;   // nombre con el que respondió la cámara (el cliente lo usa para guardar)
                return Content(r.Item2 ?? "null", "application/json");
            }
            catch (Exception e) { return BadRequest(new { error = e.Message }); }
        }

        /// <summary>
        /// PUT /api/camaras/{id}/config?name=X: escribe el bloque completo y lo vuelve a leer (misma sesión);
        /// devuelve lo que la cámara tiene ahora para que la web compruebe qué cambios aceptó.
        /// </summary>
        [HttpPut("{id}/config")]
        public async Task<IActionResult> EscribirConfig(string id, [FromQuery] string name, [FromBody] JsonElement cfg)
        {
            if (string.IsNullOrEmpty(name) || !NombreBloque.IsMatch(name)) return BadRequest(new { error = "Nombre de bloque no válido" });
            if (_almacen.Obtener(id) == null) return NotFound();
            string raw = cfg.GetRawText();
            try
            {
                string despues = await _control.EjecutarAsync(id, c => { c.SetConfigRaw(name, raw); return c.GetConfigRaw(name); });
                return Content(despues ?? "null", "application/json");
            }
            catch (Exception e) { return BadRequest(new { error = e.Message }); }
        }

        /// <summary>Datos de la IP que el usuario quiere poner a una cámara (para comprobarla antes de aplicar).</summary>
        public class IpDto { public string Ip { get; set; } }

        /// <summary>Bloques que prueba el explorador: los habituales de las cámaras XM/DVRIP (red, IPv6 por si el firmware lo trae, vídeo, alarmas, sistema…).</summary>
        private static readonly string[] BloquesCandidatos =
        {
            "NetWork.NetCommon", "NetWork.NetDHCP", "NetWork.NetDNS", "NetWork.Wifi", "NetWork.NetIPv6", "NetWork.NetIPV6", "NetWork.IPv6", "NetWork.Ipv6",
            "NetWork.NetPPPoE", "NetWork.NetDDNS", "NetWork.NetUPNP", "NetWork.UPnP", "NetWork.NetIPFilter", "NetWork.NetEmail", "NetWork.NetFTP", "NetWork.NetNTP",
            "NetWork.NetRTSP", "NetWork.RTSP", "NetWork.OnvifPwdCheckout", "NetWork.Onvif", "NetWork.NetARSP", "NetWork.NetOrder", "NetWork.NetMobile", "NetWork.Mobile",
            "NetWork.NetDecode", "NetWork.NetServer", "NetWork.Server", "NetWork.XMeye", "NetWork.Cloud", "NetWork.Nat", "NetWork.NetAlarmCenter",
            "Detect.MotionDetect", "Detect.HumanDetection", "Detect.BlindDetect", "Detect.LossDetect", "Detect.FaceDetection", "Alarm.LocalAlarm", "Alarm.AlarmOut",
            "Alarm.PIR", "Alarm.NetAlarm", "Alarm.NetIpConflict", "Alarm.StorageLowSpace", "Alarm.StorageFailure", "Alarm.StorageNotExist", "Alarm.LoginFailed",
            "Simplify.Encode", "Camera.Param", "Camera.ParamEx", "Camera.WhiteLight", "Camera.ClearFog", "AVEnc.VideoWidget", "AVEnc.Encode.[0]", "AVEnc.Audio",
            "Record", "Record.[0]", "StorageInfo", "Storage", "Uart.PTZ", "Uart.Comm",
            "General.General", "General.Location", "General.AutoMaintain", "General.Spare", "System.TimeZone", "System.Locales", "Fb.Cfg",
            "ChannelTitle", "Ability.EncodeCapability", "Ability.SystemFunction", "Ability.NetWork"
        };

        /// <summary>
        /// GET /api/camaras/{id}/explorar[?completo=1]: prueba una lista de bloques habituales y devuelve cuáles admite la cámara
        /// (con el JSON de cada uno si completo=1). Sirve para saber qué se puede configurar de verdad (IPv6, DNS, DHCP…) y para copias de seguridad.
        /// </summary>
        [HttpGet("{id}/explorar")]
        public async Task<IActionResult> Explorar(string id, [FromQuery] int completo = 0)
        {
            if (_almacen.Obtener(id) == null) return NotFound();
            try
            {
                var lista = await _control.EjecutarAsync(id, c =>
                {
                    var res = new System.Collections.Generic.List<object>();
                    foreach (string nombre in BloquesCandidatos)
                    {
                        try
                        {
                            var r = LeerConIndice(c, nombre);
                            bool ok = !string.IsNullOrEmpty(r.Item2) && r.Item2 != "null";
                            JsonElement? datos = null;
                            if (ok && completo == 1) { using (var d = JsonDocument.Parse(r.Item2)) datos = d.RootElement.Clone(); }
                            res.Add(new { nombre, efectivo = r.Item1, ok, bytes = ok ? r.Item2.Length : 0, datos, error = (string)null });
                        }
                        catch (Exception e) { res.Add(new { nombre, efectivo = nombre, ok = false, bytes = 0, datos = (JsonElement?)null, error = e.Message }); }
                    }
                    return res;
                });
                return Ok(new { bloques = lista });
            }
            catch (Exception e) { return BadRequest(new { error = e.Message }); }
        }

        /// <summary>True si [ip] está en la misma subred que alguna interfaz de red activa de este equipo.</summary>
        private static bool MismaSubred(IPAddress ip)
        {
            byte[] b = ip.GetAddressBytes();
            foreach (var ni in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (ni.OperationalStatus != OperationalStatus.Up) continue;
                foreach (var ua in ni.GetIPProperties().UnicastAddresses)
                {
                    if (ua.Address.AddressFamily != AddressFamily.InterNetwork || ua.IPv4Mask == null) continue;
                    byte[] a = ua.Address.GetAddressBytes(), m = ua.IPv4Mask.GetAddressBytes();
                    bool igual = true;
                    for (int i = 0; i < 4; i++) if ((a[i] & m[i]) != (b[i] & m[i])) { igual = false; break; }
                    if (igual) return true;
                }
            }
            return false;
        }

        /// <summary>True si algo contesta en [ip]: responde a ping o acepta conexión en el puerto de la cámara (evita duplicar una IP en uso).</summary>
        private static bool RespondeIp(IPAddress ip, int puerto)
        {
            try { using (var p = new Ping()) { if (p.Send(ip, 800).Status == IPStatus.Success) return true; } } catch (Exception) { }
            try
            {
                using (var t = new TcpClient())
                {
                    var r = t.BeginConnect(ip, puerto, null, null);
                    return r.AsyncWaitHandle.WaitOne(800) && t.Connected;
                }
            }
            catch (Exception) { return false; }
        }

        /// <summary>
        /// POST /api/camaras/{id}/red/comprobar {ip}: antes de cambiar la IP de una cámara comprueba que sea válida,
        /// que esté en la misma subred que este equipo y que no la use ya otro dispositivo.
        /// </summary>
        [HttpPost("{id}/red/comprobar")]
        public async Task<IActionResult> ComprobarIp(string id, [FromBody] IpDto d)
        {
            var cam = _almacen.Obtener(id);
            if (cam == null) return NotFound();
            string txt = (d?.Ip ?? "").Trim();
            if (txt.Split('.').Length != 4 || !IPAddress.TryParse(txt, out IPAddress ip) || ip.AddressFamily != AddressFamily.InterNetwork)
                return Ok(new { valida = false });
            string norm = ip.ToString();
            bool esActual = string.Equals(norm, cam.Host, StringComparison.OrdinalIgnoreCase);
            bool misma = MismaSubred(ip);
            bool enUso = !esActual && await Task.Run(() => RespondeIp(ip, cam.Puerto));
            return Ok(new { valida = true, ip = norm, esActual, mismaSubred = misma, enUso });
        }

        /// <summary>POST /api/camaras/{id}/hora: pone la hora de la cámara igual a la del servidor.</summary>
        [HttpPost("{id}/hora")]
        public async Task<IActionResult> SincronizarHora(string id)
        {
            if (_almacen.Obtener(id) == null) return NotFound();
            string ahora = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
            try { await _control.EjecutarAsync(id, c => { c.SetTime(ahora); return 0; }); return Ok(new { hora = ahora }); }
            catch (Exception e) { return BadRequest(new { error = e.Message }); }
        }

        /// <summary>POST /api/camaras/{id}/reiniciar: reinicia la cámara.</summary>
        [HttpPost("{id}/reiniciar")]
        public async Task<IActionResult> Reiniciar(string id)
        {
            if (_almacen.Obtener(id) == null) return NotFound();
            try { await _control.EjecutarAsync(id, c => { c.Reboot(); return 0; }); return Ok(); }
            catch (Exception e) { return BadRequest(new { error = e.Message }); }
        }

        /// <summary>POST /api/camaras/{id}/ptz: movimiento continuo (cmd null = parar).</summary>
        [HttpPost("{id}/ptz")]
        public IActionResult Ptz(string id, [FromBody] PtzDto d)
        {
            if (d.Cmd != null && Array.IndexOf(PtzCmd.Movimiento, d.Cmd) < 0) return BadRequest(new { error = "Comando PTZ no válido" });
            return _ptz.Mover(id, d.Cmd, d.Step, d.Seq) ? Ok() : NotFound();
        }

        /// <summary>POST /api/camaras/{id}/preset: ir a / guardar una posición (1..6).</summary>
        [HttpPost("{id}/preset")]
        public async Task<IActionResult> Preset(string id, [FromBody] PresetDto d)
        {
            if (d.Cmd != PtzCmd.GotoPreset && d.Cmd != PtzCmd.SetPreset) return BadRequest(new { error = "Comando no válido" });
            if (d.N < 1 || d.N > 6) return BadRequest(new { error = "Preset fuera de rango" });
            if (_almacen.Obtener(id) == null) return NotFound();
            try { await _ptz.PresetAsync(id, d.Cmd, d.N); return Ok(); }
            catch (Exception e) { return BadRequest(new { error = "PTZ: " + e.Message }); }
        }

        /// <summary>GET /api/camaras/{id}/captura: JPEG actual de la cámara (descargar=1 fuerza la descarga).</summary>
        [HttpGet("{id}/captura")]
        public async Task<IActionResult> Captura(string id, [FromQuery] int descargar = 0)
        {
            var cam = _almacen.Obtener(id);
            if (cam == null) return NotFound();
            try
            {
                byte[] bytes = await Http.GetByteArrayAsync(cam.SnapshotUrl());
                // Un JPEG empieza por FF D8; si no, la cámara devolvió una página de error.
                if (bytes.Length < 4 || bytes[0] != 0xFF || bytes[1] != 0xD8) return StatusCode(502);
                Response.Headers["Cache-Control"] = "no-store";
                string nombre = "captura_" + DateTime.Now.ToString("yyyyMMdd_HHmmss") + ".jpg";
                return descargar == 1 ? File(bytes, "image/jpeg", nombre) : File(bytes, "image/jpeg");
            }
            catch (Exception) { return StatusCode(502); }
        }
    }
}
