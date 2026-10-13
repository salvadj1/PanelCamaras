using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using CentroSeguridad.Services;
using CentroSeguridad.Services.Alarmas;
using Microsoft.AspNetCore.Mvc;

namespace CentroSeguridad.Controllers
{
    /// <summary>Datos de una regla enviados por el navegador.</summary>
    public class ReglaDto
    {
        public string Id { get; set; }
        public string Nombre { get; set; }
        public bool Activa { get; set; } = true;
        public string CamaraId { get; set; } = "";
        public List<string> Eventos { get; set; } = new List<string>();
        public bool SoloInicio { get; set; } = true;
        public int Desde { get; set; } = -1;
        public int Hasta { get; set; } = -1;
        public string Perfil { get; set; } = "";
        public int EsperaSeg { get; set; } = 30;
        public List<Accion> Acciones { get; set; } = new List<Accion>();
    }

    /// <summary>API JSON de alarmas: reglas, perfiles, vigilancia y historial de eventos.</summary>
    [ApiController]
    public class AlarmasApiController : ControllerBase
    {
        private readonly AlmacenReglas _reglas;
        private readonly AlmacenCamaras _camaras;
        private readonly ServicioAlarmas _servicio;

        public AlarmasApiController(AlmacenReglas reglas, AlmacenCamaras camaras, ServicioAlarmas servicio)
        {
            _reglas = reglas; _camaras = camaras; _servicio = servicio;
        }

        /// <summary>GET /api/reglas: reglas, perfiles, perfil activo y lista de eventos conocidos.</summary>
        [HttpGet("api/reglas")]
        public IActionResult Lista() => Ok(new
        {
            reglas = _reglas.Reglas(),
            perfiles = _reglas.Perfiles(),
            perfilActivo = _reglas.PerfilActivo(),
            fotoAutomatica = _reglas.FotoAutomatica(),
            eventos = Eventos.Lista.Select(e => new { clave = e.Clave, texto = e.Texto }),
            vigilando = _camaras.Listar().Count(c => c.Vigilar && _servicio.Vigilando(c.Id))
        });

        /// <summary>PUT /api/reglas/{id}: crea o reemplaza una regla (valida y limpia los datos).</summary>
        [HttpPut("api/reglas/{id}")]
        public IActionResult Guardar(string id, [FromBody] ReglaDto d)
        {
            if (d == null || string.IsNullOrWhiteSpace(id) || id.Length > 40) return BadRequest(new { error = "Datos no válidos" });
            var tipos = new[] { TipoAccion.Notificar, TipoAccion.Foto, TipoAccion.HttpGet, TipoAccion.PtzPreset };
            var r = new Regla
            {
                Id = id, Nombre = string.IsNullOrWhiteSpace(d.Nombre) ? "Regla" : d.Nombre.Trim(),
                Activa = d.Activa, CamaraId = d.CamaraId ?? "",
                Eventos = d.Eventos != null && d.Eventos.Count > 0 ? d.Eventos : new List<string> { "*" },
                SoloInicio = d.SoloInicio, Perfil = d.Perfil ?? "", EsperaSeg = Math.Max(0, d.EsperaSeg),
                Acciones = (d.Acciones ?? new List<Accion>()).Where(a => a != null && tipos.Contains(a.Tipo)).ToList()
            };
            bool franja = d.Desde >= 0 && d.Hasta >= 0 && d.Desde < 1440 && d.Hasta < 1440;
            r.Desde = franja ? d.Desde : -1; r.Hasta = franja ? d.Hasta : -1;
            if (r.Acciones.Any(a => a.Tipo == TipoAccion.HttpGet && !(Uri.TryCreate(a.Param, UriKind.Absolute, out var u) && (u.Scheme == "http" || u.Scheme == "https"))))
                return BadRequest(new { error = "La URL debe empezar por http:// o https://" });
            _reglas.GuardarRegla(r);
            return Ok(r);
        }

        /// <summary>DELETE /api/reglas/{id}.</summary>
        [HttpDelete("api/reglas/{id}")]
        public IActionResult Borrar(string id) => _reglas.BorrarRegla(id) ? Ok() : NotFound();

        /// <summary>PUT /api/perfiles: lista de perfiles.</summary>
        [HttpPut("api/perfiles")]
        public IActionResult Perfiles([FromBody] List<string> perfiles)
        {
            var l = (perfiles ?? new List<string>()).Select(p => (p ?? "").Trim()).Where(p => p.Length > 0 && p.Length <= 30).Distinct().ToList();
            if (l.Count == 0) return BadRequest(new { error = "Hace falta al menos un perfil" });
            _reglas.GuardarPerfiles(l);
            return Ok(new { perfiles = l, perfilActivo = _reglas.PerfilActivo() });
        }

        /// <summary>PUT /api/perfiles/activo?nombre=...: perfil activo.</summary>
        [HttpPut("api/perfiles/activo")]
        public IActionResult Activo([FromQuery] string nombre)
        {
            if (!_reglas.Perfiles().Contains(nombre ?? "")) return BadRequest(new { error = "Perfil desconocido" });
            _reglas.FijarPerfil(nombre);
            return Ok();
        }

        /// <summary>PUT /api/alarmas/foto-automatica?valor=true|false.</summary>
        [HttpPut("api/alarmas/foto-automatica")]
        public IActionResult FotoAuto([FromQuery] bool valor) { _reglas.FijarFotoAutomatica(valor); return Ok(); }

        /// <summary>GET /api/eventos?desde=id: historial (más nuevos primero); con desde, solo los posteriores.</summary>
        [HttpGet("api/eventos")]
        public IActionResult Historial([FromQuery] long desde = 0) =>
            Ok(_reglas.Eventos(desde).Select(e => new
            {
                e.Id, e.Hora, e.CamaraId, e.Camara, e.Evento, texto = Eventos.Etiqueta(e.Evento), e.Estado, e.Notificar,
                foto = string.IsNullOrEmpty(e.Foto) ? null : "/api/eventos/foto/" + e.Foto
            }));

        /// <summary>DELETE /api/eventos: borra todo el historial.</summary>
        [HttpDelete("api/eventos")]
        public IActionResult BorrarTodo() { _reglas.BorrarEventos(); return Ok(); }

        /// <summary>GET /api/eventos/foto/{nombre}: foto guardada de un evento.</summary>
        [HttpGet("api/eventos/foto/{nombre}")]
        public IActionResult Foto(string nombre)
        {
            string ruta = Path.Combine(_reglas.CarpetaFotos, Path.GetFileName(nombre ?? ""));
            if (!System.IO.File.Exists(ruta)) return NotFound();
            return PhysicalFile(ruta, "image/jpeg");
        }
    }
}
