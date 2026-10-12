using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using CentroSeguridad.Services;
using CentroSeguridad.Services.Alarmas;
using Microsoft.AspNetCore.Mvc;

namespace CentroSeguridad.Controllers
{
    /// <summary>Copia de seguridad que se exporta/importa: reglas y perfiles de alarma (las cámaras y sus contraseñas no se incluyen).</summary>
    public class CopiaDto
    {
        public List<Regla> Reglas { get; set; } = new List<Regla>();
        public List<string> Perfiles { get; set; } = new List<string>();
        public string PerfilActivo { get; set; } = "";
        public bool FotoAutomatica { get; set; } = true;
    }

    /// <summary>API de la página de Ajustes: estado del sistema, almacenamiento y copia de seguridad.</summary>
    [ApiController]
    public class SistemaApiController : ControllerBase
    {
        private readonly Go2RtcService _go2rtc;
        private readonly AlmacenCamaras _camaras;
        private readonly AlmacenReglas _reglas;
        private readonly AlmacenGrabaciones _grabaciones;
        private readonly ServicioAlarmas _alarmas;

        public SistemaApiController(Go2RtcService go2rtc, AlmacenCamaras camaras, AlmacenReglas reglas, AlmacenGrabaciones grabaciones, ServicioAlarmas alarmas)
        {
            _go2rtc = go2rtc; _camaras = camaras; _reglas = reglas; _grabaciones = grabaciones; _alarmas = alarmas;
        }

        private static string CarpetaMiniaturas => Path.Combine(AppContext.BaseDirectory, "datos", "miniaturas");

        /// <summary>Suma el tamaño (bytes) de los archivos de una carpeta y sus subcarpetas; 0 si no existe.</summary>
        private static long Tamano(string dir)
        {
            try { return Directory.Exists(dir) ? new DirectoryInfo(dir).EnumerateFiles("*", SearchOption.AllDirectories).Sum(f => f.Length) : 0; }
            catch (Exception) { return 0; }
        }

        /// <summary>GET /api/sistema: versión, estado de go2rtc/ffmpeg, cámaras, espacio usado y rutas de grabaciones.</summary>
        [HttpGet("api/sistema")]
        public IActionResult Estado()
        {
            var cams = _camaras.Listar();
            DateTime inicio;
            try { inicio = Process.GetCurrentProcess().StartTime; } catch (Exception) { inicio = DateTime.Now; }
            return Ok(new
            {
                version = typeof(SistemaApiController).Assembly.GetName().Version?.ToString(),
                so = RuntimeInformation.OSDescription,
                runtime = RuntimeInformation.FrameworkDescription,
                inicio = new DateTimeOffset(inicio).ToUnixTimeMilliseconds(),
                go2rtc = new { disponible = _go2rtc.Disponible, mensaje = _go2rtc.Mensaje },
                ffmpeg = _go2rtc.FfmpegDisponible,
                camaras = cams.Count,
                vigilando = cams.Count(c => c.Vigilar && _alarmas.Vigilando(c.Id)),
                eventos = _reglas.Eventos().Count,
                fotosBytes = Tamano(_reglas.CarpetaFotos),
                miniaturasBytes = Tamano(CarpetaMiniaturas),
                rutas = _grabaciones.Listar()
            });
        }

        /// <summary>POST /api/sistema/reiniciar-go2rtc: regenera la configuración y reinicia el conversor de vídeo.</summary>
        [HttpPost("api/sistema/reiniciar-go2rtc")]
        public IActionResult ReiniciarGo2Rtc() { _go2rtc.Reiniciar(); return Ok(); }

        /// <summary>DELETE /api/sistema/miniaturas: borra las miniaturas guardadas de la SD (se regeneran al abrir la biblioteca).</summary>
        [HttpDelete("api/sistema/miniaturas")]
        public IActionResult BorrarMiniaturas()
        {
            try { if (Directory.Exists(CarpetaMiniaturas)) Directory.Delete(CarpetaMiniaturas, true); }
            catch (Exception e) { return BadRequest(new { error = e.Message }); }
            return Ok();
        }

        /// <summary>GET /api/copia: reglas, perfiles y perfil activo para guardarlos en un archivo.</summary>
        [HttpGet("api/copia")]
        public IActionResult Exportar() => Ok(new CopiaDto
        {
            Reglas = _reglas.Reglas(), Perfiles = _reglas.Perfiles(), PerfilActivo = _reglas.PerfilActivo(), FotoAutomatica = _reglas.FotoAutomatica()
        });

        /// <summary>PUT /api/copia: restaura reglas y perfiles (reemplaza los actuales). Se descartan acciones desconocidas y URLs no http(s).</summary>
        [HttpPut("api/copia")]
        public IActionResult Importar([FromBody] CopiaDto d)
        {
            if (d == null || d.Reglas == null || d.Perfiles == null) return BadRequest(new { error = "Archivo de copia no válido" });
            var perfiles = d.Perfiles.Select(p => (p ?? "").Trim()).Where(p => p.Length > 0 && p.Length <= 30).Distinct().ToList();
            if (perfiles.Count == 0) return BadRequest(new { error = "La copia no tiene perfiles" });
            var tipos = new[] { TipoAccion.Notificar, TipoAccion.Foto, TipoAccion.HttpGet, TipoAccion.PtzPreset };
            var nuevas = new List<Regla>();
            foreach (var r in d.Reglas)
            {
                if (r == null || string.IsNullOrWhiteSpace(r.Id) || r.Id.Length > 40) continue;
                r.Acciones = (r.Acciones ?? new List<Accion>()).Where(a => a != null && tipos.Contains(a.Tipo)
                    && (a.Tipo != TipoAccion.HttpGet || (Uri.TryCreate(a.Param, UriKind.Absolute, out var u) && (u.Scheme == "http" || u.Scheme == "https")))).ToList();
                if (r.Eventos == null || r.Eventos.Count == 0) r.Eventos = new List<string> { "*" };
                nuevas.Add(r);
            }
            foreach (var viejo in _reglas.Reglas()) _reglas.BorrarRegla(viejo.Id);
            foreach (var r in nuevas) _reglas.GuardarRegla(r);
            _reglas.GuardarPerfiles(perfiles);
            if (perfiles.Contains(d.PerfilActivo ?? "")) _reglas.FijarPerfil(d.PerfilActivo);
            _reglas.FijarFotoAutomatica(d.FotoAutomatica);
            return Ok(new { reglas = nuevas.Count });
        }
    }
}
