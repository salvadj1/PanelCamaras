using CentroSeguridad.Services;
using Microsoft.AspNetCore.Mvc;

namespace CentroSeguridad.Controllers
{
    /// <summary>Páginas del panel de cámaras (mosaico, añadir, directo y ajustes de la web).</summary>
    public class CamarasController : Controller
    {
        private readonly AlmacenCamaras _almacen;

        public CamarasController(AlmacenCamaras almacen) { _almacen = almacen; }

        /// <summary>GET /: mosaico con las cámaras agregadas (página de inicio).</summary>
        [HttpGet("")]
        public IActionResult Index() => View();

        /// <summary>GET /camaras/nueva: añadir cámara (búsqueda en red o manual).</summary>
        [HttpGet("camaras/nueva")]
        public IActionResult Nueva() => View();

        /// <summary>GET /camara/{id}: directo de una cámara con PTZ.</summary>
        [HttpGet("camara/{id}")]
        public IActionResult Directo(string id)
        {
            var cam = _almacen.Obtener(id);
            if (cam == null) return NotFound();
            ViewData["CamId"] = cam.Id;
            ViewData["CamNombre"] = cam.Nombre;
            return View();
        }

        /// <summary>GET /camara/{id}/config: editor de un bloque de configuración de la cámara (?name=...&amp;filter=...).</summary>
        [HttpGet("camara/{id}/config")]
        public IActionResult Config(string id)
        {
            var cam = _almacen.Obtener(id);
            if (cam == null) return NotFound();
            ViewData["CamId"] = cam.Id;
            ViewData["CamNombre"] = cam.Nombre;
            return View();
        }

        /// <summary>GET /camara/{id}/sd: grabaciones de la tarjeta SD de la cámara.</summary>
        [HttpGet("camara/{id}/sd")]
        public IActionResult Sd(string id)
        {
            var cam = _almacen.Obtener(id);
            if (cam == null) return NotFound();
            ViewData["CamId"] = cam.Id;
            ViewData["CamNombre"] = cam.Nombre;
            return View();
        }

        /// <summary>GET /ajustes: tema y preferencias de la web.</summary>
        [HttpGet("ajustes")]
        public IActionResult Ajustes() => View();
    }
}
