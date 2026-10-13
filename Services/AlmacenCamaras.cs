using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text.Json;
using CentroSeguridad.Models;
using Microsoft.AspNetCore.DataProtection;

namespace CentroSeguridad.Services
{
    /// <summary>
    /// Persistencia de las cámaras en <c>datos/camaras.json</c> junto al .exe. Las contraseñas se guardan
    /// CIFRADAS con ASP.NET Core Data Protection (claves en <c>datos/keys</c>, protegidas con DPAPI del equipo).
    /// </summary>
    public class AlmacenCamaras
    {
        /// <summary>Formato en disco (la contraseña va cifrada).</summary>
        public class Guardada
        {
            public string Id { get; set; }
            public string Nombre { get; set; }
            public string Host { get; set; }
            public int Puerto { get; set; } = 34567;
            public string Usuario { get; set; }
            public string PasswordCifrada { get; set; }
            public int PuertoRtsp { get; set; } = 554;
            public int PuertoHttp { get; set; } = 80;
            public int Canal { get; set; }
            public bool RtspHash { get; set; }
            public bool Vigilar { get; set; } = true;
        }

        private readonly object _lock = new object();
        private readonly IDataProtector _proteccion;
        private readonly string _archivo;
        private List<CamaraXm> _camaras;

        /// <summary>Se dispara cuando se añade o elimina una cámara.</summary>
        public event Action Cambio;

        public AlmacenCamaras(IDataProtectionProvider proveedor)
        {
            _proteccion = proveedor.CreateProtector("PanelCamaras.Camaras.v1");
            string dir = Path.Combine(AppContext.BaseDirectory, "datos");
            Directory.CreateDirectory(dir);
            _archivo = Path.Combine(dir, "camaras.json");
            _camaras = Cargar();
        }

        /// <summary>Copia de la lista actual.</summary>
        public List<CamaraXm> Listar() { lock (_lock) return _camaras.ToList(); }

        /// <summary>Busca una cámara por id (null si no existe).</summary>
        public CamaraXm Obtener(string id) { lock (_lock) return _camaras.FirstOrDefault(c => c.Id == id); }

        /// <summary>Añade una cámara y la guarda.</summary>
        public void Agregar(CamaraXm cam)
        {
            lock (_lock) { _camaras.Add(cam); Guardar(); }
            Cambio?.Invoke();
        }

        /// <summary>Modifica una cámara existente con <paramref name="cambio"/>, la guarda y avisa del cambio. false si no existe.</summary>
        public bool Actualizar(string id, Action<CamaraXm> cambio)
        {
            lock (_lock)
            {
                var cam = _camaras.FirstOrDefault(c => c.Id == id);
                if (cam == null) return false;
                cambio(cam);
                Guardar();
            }
            Cambio?.Invoke();
            return true;
        }

        /// <summary>Elimina una cámara. Devuelve false si no existía.</summary>
        public bool Eliminar(string id)
        {
            bool ok;
            lock (_lock)
            {
                ok = _camaras.RemoveAll(c => c.Id == id) > 0;
                if (ok) Guardar();
            }
            if (ok) Cambio?.Invoke();
            return ok;
        }

        private List<CamaraXm> Cargar()
        {
            try
            {
                if (!File.Exists(_archivo)) return new List<CamaraXm>();
                var lista = JsonSerializer.Deserialize<List<Guardada>>(File.ReadAllText(_archivo)) ?? new List<Guardada>();
                return lista.Select(g => new CamaraXm
                {
                    Id = g.Id, Nombre = g.Nombre, Host = g.Host, Puerto = g.Puerto, Usuario = g.Usuario,
                    Password = Descifrar(g.PasswordCifrada), PuertoRtsp = g.PuertoRtsp, PuertoHttp = g.PuertoHttp,
                    Canal = g.Canal, RtspHash = g.RtspHash, Vigilar = g.Vigilar
                }).ToList();
            }
            catch (Exception) { return new List<CamaraXm>(); }
        }

        private string Descifrar(string t)
        {
            if (string.IsNullOrEmpty(t)) return "";
            try { return _proteccion.Unprotect(t); }
            catch (CryptographicException) { return ""; } // claves perdidas: habrá que reintroducir la contraseña
        }

        private void Guardar()
        {
            var lista = _camaras.Select(c => new Guardada
            {
                Id = c.Id, Nombre = c.Nombre, Host = c.Host, Puerto = c.Puerto, Usuario = c.Usuario,
                PasswordCifrada = string.IsNullOrEmpty(c.Password) ? "" : _proteccion.Protect(c.Password),
                PuertoRtsp = c.PuertoRtsp, PuertoHttp = c.PuertoHttp, Canal = c.Canal, RtspHash = c.RtspHash, Vigilar = c.Vigilar
            }).ToList();
            string tmp = _archivo + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(lista, new JsonSerializerOptions { WriteIndented = true }));
            File.Move(tmp, _archivo, true);
        }
    }
}
