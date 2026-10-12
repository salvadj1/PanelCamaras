using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using CentroSeguridad.Models;
using Microsoft.Extensions.Configuration;

namespace CentroSeguridad.Services
{
    /// <summary>
    /// Acceso seguro de solo lectura a las carpetas de grabaciones configuradas.
    /// Valida nombres de ruta, evita salir de la carpeta raíz (path traversal) y
    /// limita los tipos de archivo. Reutilizable en cualquier app que sirva archivos de carpetas fijas.
    /// </summary>
    public class AlmacenGrabaciones
    {
        /// <summary>Extensiones permitidas y su tipo MIME.</summary>
        private static readonly Dictionary<string, string> Tipos = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            { ".h264", "video/h264" }, { ".jpg", "image/jpeg" }, { ".jpeg", "image/jpeg" },
            { ".png", "image/png" }, { ".bmp", "image/bmp" }, { ".webp", "image/webp" }
        };

        private readonly List<RutaGrabacion> _rutas;

        /// <summary>
        /// Lee la sección "RutaDeGrabaciones" de la configuración e ignora las entradas sin nombre o sin ruta.
        /// </summary>
        /// <param name="config">Configuración de la aplicación.</param>
        public AlmacenGrabaciones(IConfiguration config)
        {
            _rutas = (config.GetSection("RutaDeGrabaciones").Get<List<RutaGrabacion>>() ?? new List<RutaGrabacion>())
                .Where(r => !string.IsNullOrWhiteSpace(r.Nombre) && !string.IsNullOrWhiteSpace(r.Ruta))
                .ToList();
        }

        /// <summary>Devuelve las rutas configuradas y si cada carpeta existe ahora mismo.</summary>
        public IEnumerable<object> Listar() =>
            _rutas.Select(r => new { nombre = r.Nombre, disponible = Directory.Exists(r.Ruta) });

        /// <summary>
        /// Enumera recursivamente los archivos permitidos de una ruta.
        /// </summary>
        /// <param name="nombre">Nombre de la ruta configurada.</param>
        /// <returns>Lista de (ruta relativa con '/', tamaño en bytes), o null si la ruta no existe.</returns>
        public List<(string p, long s)> Indice(string nombre)
        {
            var raiz = Raiz(nombre);
            if (raiz == null || !Directory.Exists(raiz)) return null;
            var opciones = new EnumerationOptions { RecurseSubdirectories = true, IgnoreInaccessible = true };
            var res = new List<(string, long)>();
            foreach (var f in new DirectoryInfo(raiz).EnumerateFiles("*", opciones))
            {
                if (!Tipos.ContainsKey(f.Extension)) continue;
                res.Add((Path.GetRelativePath(raiz, f.FullName).Replace('\\', '/'), f.Length));
            }
            return res;
        }

        /// <summary>
        /// Resuelve un archivo dentro de una ruta configurada, garantizando que no sale de ella.
        /// </summary>
        /// <param name="nombre">Nombre de la ruta configurada.</param>
        /// <param name="relativa">Ruta relativa del archivo (separador '/').</param>
        /// <param name="tipo">Tipo MIME resultante.</param>
        /// <returns>Ruta física completa, o null si no es válida o no existe.</returns>
        public string Archivo(string nombre, string relativa, out string tipo)
        {
            tipo = null;
            var raiz = Raiz(nombre);
            if (raiz == null || string.IsNullOrEmpty(relativa)) return null;
            var completa = Path.GetFullPath(Path.Combine(raiz, relativa.Replace('/', Path.DirectorySeparatorChar)));
            var baseDir = raiz.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            if (!completa.StartsWith(baseDir, StringComparison.OrdinalIgnoreCase)) return null;   // path traversal
            if (!Tipos.TryGetValue(Path.GetExtension(completa), out tipo)) return null;           // tipo no permitido
            return File.Exists(completa) ? completa : null;
        }

        /// <summary>Devuelve la ruta física completa de una ruta configurada por su nombre (o null).</summary>
        private string Raiz(string nombre)
        {
            var r = _rutas.FirstOrDefault(x => string.Equals(x.Nombre, nombre, StringComparison.OrdinalIgnoreCase));
            return r == null ? null : Path.GetFullPath(r.Ruta);
        }
    }
}
