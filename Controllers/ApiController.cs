using System.Linq;
using CentroSeguridad.Services;
using Microsoft.AspNetCore.Mvc;

namespace CentroSeguridad.Controllers
{
    /// <summary>
    /// API de solo lectura para que cualquier navegador de la red consulte las grabaciones del servidor.
    /// </summary>
    [Route("api")]
    public class ApiController : Controller
    {
        private readonly AlmacenGrabaciones _almacen;

        /// <summary>Recibe el almacén de grabaciones por inyección de dependencias.</summary>
        public ApiController(AlmacenGrabaciones almacen) { _almacen = almacen; }

        /// <summary>GET /api/rutas: lista las rutas configuradas [{nombre, disponible}].</summary>
        [HttpGet("rutas")]
        public IActionResult Rutas() => Json(_almacen.Listar());

        /// <summary>GET /api/indice?ruta=X: lista de archivos [{p, s}] (ruta relativa y tamaño).</summary>
        [HttpGet("indice")]
        public IActionResult Indice(string ruta)
        {
            var lista = _almacen.Indice(ruta);
            if (lista == null) return NotFound();
            return Json(lista.Select(x => new { x.p, x.s }));
        }

        /// <summary>GET /api/archivo?ruta=X&amp;p=relativa: sirve el archivo (con soporte Range).</summary>
        [HttpGet("archivo")]
        public IActionResult Archivo(string ruta, string p)
        {
            var fisica = _almacen.Archivo(ruta, p, out var tipo);
            if (fisica == null) return NotFound();
            return PhysicalFile(fisica, tipo, enableRangeProcessing: true);
        }
    }
}
