using System;
using System.Globalization;
using System.IO;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using CentroSeguridad.Services;
using Microsoft.AspNetCore.Mvc;

namespace CentroSeguridad.Controllers
{
    /// <summary>API de las grabaciones de la tarjeta SD de una cámara: listado por día y descarga de clips.</summary>
    [ApiController]
    [Route("api/camaras/{id}/sd")]
    public class SdApiController : ControllerBase
    {
        private static readonly Regex Fecha = new Regex(@"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$", RegexOptions.Compiled);
        private static readonly Regex Fichero = new Regex(@"^[A-Za-z0-9_\-./\[\]@:+ ]{1,200}$", RegexOptions.Compiled);
        private static readonly Regex IdCam = new Regex("^[0-9a-f]{32}$", RegexOptions.Compiled);
        private const long MaxMiniatura = 300 * 1024;   // una miniatura JPEG de 320 px pesa ~15 KB; 300 KB es margen de sobra
        private readonly ServicioSd _sd;

        public SdApiController(ServicioSd sd) { _sd = sd; }

        /// <summary>GET /api/camaras/{id}/sd?dia=yyyy-MM-dd: grabaciones de ese día (array JSON de la cámara).</summary>
        [HttpGet("")]
        public async Task<IActionResult> Lista(string id, [FromQuery] string dia)
        {
            if (!DateTime.TryParseExact(dia, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d))
                return BadRequest(new { error = "Día no válido" });
            try { return Content(await _sd.ListarAsync(id, d), "application/json"); }
            catch (Exception e) { return BadRequest(new { error = "No se pudo leer la SD: " + e.Message }); }
        }

        /// <summary>
        /// GET /api/camaras/{id}/sd/clip?file=&amp;begin=&amp;end=&amp;max=: bytes del clip en formato XM sin convertir.
        /// "max" limita la descarga (para miniaturas basta con el principio).
        /// </summary>
        [HttpGet("clip")]
        public async Task<IActionResult> Clip(string id, [FromQuery] string file, [FromQuery] string begin, [FromQuery] string end, [FromQuery] long max = 0)
        {
            if (string.IsNullOrEmpty(file) || !Fichero.IsMatch(file) || file.Contains("..") || !Fecha.IsMatch(begin ?? "") || !Fecha.IsMatch(end ?? ""))
                return BadRequest(new { error = "Datos del clip no válidos" });
            Response.ContentType = "application/octet-stream";
            Response.Headers["Cache-Control"] = "no-store";
            try { await _sd.DescargarAsync(id, file, begin, end, max > 0 ? max : long.MaxValue, Response.Body, HttpContext.RequestAborted); }
            catch (OperationCanceledException) { }
            catch (Exception e) when (!Response.HasStarted) { return StatusCode(502, new { error = e.Message }); }
            return new EmptyResult();
        }

        /// <summary>Ruta del JPEG en caché de la miniatura de un clip (datos/miniaturas/{cámara}/{inicio}.jpg), o null si los datos no son válidos.</summary>
        private static string RutaMini(string id, string begin)
        {
            if (!IdCam.IsMatch(id ?? "") || !Fecha.IsMatch(begin ?? "")) return null;
            string nombre = begin.Replace(' ', 'T').Replace(':', '-') + ".jpg";
            return Path.Combine(AppContext.BaseDirectory, "datos", "miniaturas", id, nombre);
        }

        /// <summary>
        /// GET /api/camaras/{id}/sd/mini?begin=: miniatura guardada de un clip (compartida por todos los equipos de la red).
        /// 404 si todavía no existe; el navegador la genera y la sube con PUT.
        /// </summary>
        [HttpGet("mini")]
        public IActionResult MiniLeer(string id, [FromQuery] string begin)
        {
            string ruta = RutaMini(id, begin);
            if (ruta == null) return BadRequest();
            if (!System.IO.File.Exists(ruta)) return NotFound();
            Response.Headers["Cache-Control"] = "public, max-age=31536000, immutable";
            return PhysicalFile(ruta, "image/jpeg");
        }

        /// <summary>PUT /api/camaras/{id}/sd/mini?begin=: guarda la miniatura JPEG (cuerpo de la petición) de un clip.</summary>
        [HttpPut("mini")]
        public async Task<IActionResult> MiniGuardar(string id, [FromQuery] string begin)
        {
            string ruta = RutaMini(id, begin);
            if (ruta == null) return BadRequest();
            using (var ms = new MemoryStream())
            {
                await Request.Body.CopyToAsync(ms);
                var b = ms.ToArray();
                // Solo JPEG (FF D8 FF) y de tamaño razonable: la carpeta es pública para la red local.
                if (b.Length < 4 || b.Length > MaxMiniatura || b[0] != 0xFF || b[1] != 0xD8 || b[2] != 0xFF)
                    return BadRequest(new { error = "Miniatura no válida" });
                Directory.CreateDirectory(Path.GetDirectoryName(ruta));
                await System.IO.File.WriteAllBytesAsync(ruta, b);
            }
            return Ok();
        }
    }
}
