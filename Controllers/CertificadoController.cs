using System;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using CentroSeguridad.Services;
using Microsoft.AspNetCore.Mvc;

namespace CentroSeguridad.Controllers
{
    /// <summary>
    /// Ayuda a los equipos de la red a confiar en el certificado HTTPS autofirmado del servidor:
    /// página de acceso con detección, prueba de conexión y descarga/instalador del certificado público.
    /// </summary>
    public class CertificadoController : Controller
    {
        /// <summary>GET /acceso: comprueba (por HTTP) si el navegador confía en el HTTPS; si no, muestra cómo instalarlo.</summary>
        [HttpGet("acceso")]
        public IActionResult Acceso() => View();

        /// <summary>GET /ping: respuesta mínima usada por la página de acceso para probar la conexión HTTPS.</summary>
        [HttpGet("ping")]
        public IActionResult Ping() => Content("ok");

        /// <summary>GET /certificado.crt: certificado público (sin clave privada) en formato DER.</summary>
        [HttpGet("certificado.crt")]
        public IActionResult Crt()
        {
            var cert = CertificadoAutofirmado.Actual;
            if (cert == null) return NotFound();
            return File(cert.Export(X509ContentType.Cert), "application/x-x509-ca-cert", "PanelCamaras.crt");
        }

        /// <summary>
        /// GET /instalar-certificado.bat: script que instala el certificado público en las
        /// autoridades raíz de confianza del equipo (requiere ejecutarlo como administrador).
        /// </summary>
        [HttpGet("instalar-certificado.bat")]
        public IActionResult Bat()
        {
            var cert = CertificadoAutofirmado.Actual;
            if (cert == null) return NotFound();
            string b64 = Convert.ToBase64String(cert.Export(X509ContentType.Cert), Base64FormattingOptions.InsertLineBreaks);

            var sb = new StringBuilder();
            sb.Append("@echo off\r\n");
            sb.Append("net session >nul 2>&1\r\n");
            sb.Append("if errorlevel 1 ( echo Ejecuta este archivo como ADMINISTRADOR. & pause & exit /b 1 )\r\n");
            sb.Append("set \"F=%TEMP%\\PanelCamaras.cer\"\r\n");
            sb.Append("echo -----BEGIN CERTIFICATE----->\"%F%\"\r\n");
            foreach (var linea in b64.Split(new[] { "\r\n", "\n" }, StringSplitOptions.RemoveEmptyEntries))
                sb.Append("echo ").Append(linea).Append(">>\"%F%\"\r\n");
            sb.Append("echo -----END CERTIFICATE----->>\"%F%\"\r\n");
            sb.Append("certutil -f -addstore Root \"%F%\"\r\n");
            sb.Append("del \"%F%\" >nul 2>&1\r\n");
            sb.Append("echo.\r\necho Listo. Cierra y vuelve a abrir el navegador.\r\npause\r\n");
            return File(Encoding.ASCII.GetBytes(sb.ToString()), "application/octet-stream", "InstalarCertificadoPanelCamaras.bat");
        }
    }
}
