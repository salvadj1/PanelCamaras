using System;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Net.Http;
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
        private static readonly Regex NombreBloque = new Regex("^[A-Za-z0-9_.]{1,64}$", RegexOptions.Compiled);

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
            return Ok(new { camaras, video = new { disponible = _go2rtc.Disponible, mensaje = _go2rtc.Mensaje } });
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

        /// <summary>PATCH /api/camaras/{id}: cambia nombre, vigilancia o RTSP con hash.</summary>
        [HttpPatch("{id}")]
        public IActionResult Editar(string id, [FromBody] EditarCamaraDto d)
        {
            if (d.Nombre != null && string.IsNullOrWhiteSpace(d.Nombre)) return BadRequest(new { error = "El nombre no puede estar vacío" });
            bool ok = _almacen.Actualizar(id, c =>
            {
                if (d.Nombre != null) c.Nombre = d.Nombre.Trim();
                if (d.Vigilar.HasValue) c.Vigilar = d.Vigilar.Value;
                if (d.RtspHash.HasValue) c.RtspHash = d.RtspHash.Value;
            });
            return ok ? Ok() : NotFound();
        }

        /// <summary>GET /api/camaras/{id}/info: información de sistema y hora de la cámara.</summary>
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
                    return new { sistema = si, hora };
                });
                return Ok(r);
            }
            catch (Exception e) { return BadRequest(new { error = e.Message }); }
        }

        /// <summary>GET /api/camaras/{id}/config?name=X: bloque de configuración de la cámara (JSON tal cual).</summary>
        [HttpGet("{id}/config")]
        public async Task<IActionResult> LeerConfig(string id, [FromQuery] string name)
        {
            if (string.IsNullOrEmpty(name) || !NombreBloque.IsMatch(name)) return BadRequest(new { error = "Nombre de bloque no válido" });
            if (_almacen.Obtener(id) == null) return NotFound();
            try
            {
                string raw = await _control.EjecutarAsync(id, c => c.GetConfigRaw(name));
                return Content(raw ?? "null", "application/json");
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
