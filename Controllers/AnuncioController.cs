using System.Security;
using CentroSeguridad.Services;
using Microsoft.AspNetCore.Mvc;

namespace CentroSeguridad.Controllers
{
    /// <summary>Descripción UPnP del dispositivo, que Windows lee para mostrar el panel en la pestaña "Red".</summary>
    public class AnuncioController : Controller
    {
        /// <summary>GET /upnp.xml: ficha del dispositivo con un enlace a la web (presentationURL).</summary>
        [HttpGet("upnp.xml")]
        public IActionResult Descripcion()
        {
            string host = SecurityElement.Escape(Request.Host.Host);
            string xml = "<?xml version=\"1.0\"?>"
                + "<root xmlns=\"urn:schemas-upnp-org:device-1-0\"><specVersion><major>1</major><minor>0</minor></specVersion>"
                + "<device><deviceType>urn:schemas-upnp-org:device:Basic:1</deviceType>"
                + "<friendlyName>Panel Camaras</friendlyName><manufacturer>Panel Camaras</manufacturer>"
                + "<modelName>Panel Camaras</modelName><UDN>uuid:" + ServicioAnuncio.Uuid + "</UDN>"
                + "<presentationURL>https://" + host + ":" + ServicioAnuncio.PuertoHttps + "/</presentationURL></device></root>";
            return Content(xml, "text/xml; charset=utf-8");
        }
    }
}
