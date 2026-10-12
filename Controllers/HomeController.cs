using Microsoft.AspNetCore.Mvc;

namespace CentroSeguridad.Controllers
{
    /// <summary>
    /// Controlador de la página principal del Centro de Seguridad.
    /// Solo devuelve la vista; toda la lógica vive en el JavaScript cliente.
    /// </summary>
    public class HomeController : Controller
    {
        /// <summary>
        /// Muestra el panel principal (Views/Home/Index.cshtml).
        /// </summary>
        /// <returns>La vista Index.</returns>
        public IActionResult Index()
        {
            return View();
        }
    }
}
