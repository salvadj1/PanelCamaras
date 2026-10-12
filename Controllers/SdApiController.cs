using System;
using System.Globalization;
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
    }
}
