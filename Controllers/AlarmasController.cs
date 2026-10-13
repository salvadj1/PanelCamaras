using Microsoft.AspNetCore.Mvc;

namespace CentroSeguridad.Controllers
{
    /// <summary>Páginas de alarmas: historial de eventos, lista de reglas y editor de regla.</summary>
    public class AlarmasController : Controller
    {
        /// <summary>GET /eventos.</summary>
        [HttpGet("eventos")]
        public IActionResult Eventos() => View();

        /// <summary>GET /reglas.</summary>
        [HttpGet("reglas")]
        public IActionResult Reglas() => View();

        /// <summary>GET /reglas/{id}: editor ("nueva" para crear).</summary>
        [HttpGet("reglas/{id}")]
        public IActionResult Regla(string id) { ViewData["ReglaId"] = id; return View(); }
    }
}
