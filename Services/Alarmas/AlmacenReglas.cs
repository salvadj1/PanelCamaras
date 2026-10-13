using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;

namespace CentroSeguridad.Services.Alarmas
{
    /// <summary>
    /// Persistencia de reglas, perfiles, perfil activo, ajustes de alarma y historial de eventos (datos/*.json)
    /// más las fotos de alarma (datos/snaps). Hilo-seguro y reutilizable para cualquier lista de objetos JSON.
    /// </summary>
    public class AlmacenReglas
    {
        private class Ajustes
        {
            public List<string> Perfiles { get; set; } = new List<string> { "Casa", "Fuera", "Noche" };
            public string PerfilActivo { get; set; } = "Casa";
            public bool FotoAutomatica { get; set; } = true;
        }

        private const int MaxEventos = 500;
        private readonly object _lock = new object();
        private readonly string _dir, _snaps;
        private List<Regla> _reglas;
        private Ajustes _aj;
        private List<EventoRec> _eventos;
        private long _ultimoId;

        public AlmacenReglas()
        {
            _dir = Path.Combine(AppContext.BaseDirectory, "datos");
            _snaps = Path.Combine(_dir, "snaps");
            Directory.CreateDirectory(_snaps);
            _reglas = Leer("reglas.json", new List<Regla>());
            _aj = Leer("alarmas.json", new Ajustes());
            _eventos = Leer("eventos.json", new List<EventoRec>());
            _ultimoId = _eventos.Count == 0 ? 0 : _eventos.Max(e => e.Id);
        }

        /// <summary>Carpeta donde se guardan las fotos de alarma.</summary>
        public string CarpetaFotos => _snaps;

        private T Leer<T>(string archivo, T defecto)
        {
            try { return JsonSerializer.Deserialize<T>(File.ReadAllText(Path.Combine(_dir, archivo))) ?? defecto; }
            catch (Exception) { return defecto; }
        }

        private void Escribir(string archivo, object datos)
        {
            try { File.WriteAllText(Path.Combine(_dir, archivo), JsonSerializer.Serialize(datos)); }
            catch (Exception) { /* disco lleno o sin permisos: se ignora */ }
        }

        // ---------------------------------------------------------------- reglas
        public List<Regla> Reglas() { lock (_lock) return _reglas.ToList(); }

        /// <summary>Crea o reemplaza una regla (por Id).</summary>
        public void GuardarRegla(Regla r)
        {
            lock (_lock)
            {
                int i = _reglas.FindIndex(x => x.Id == r.Id);
                if (i >= 0) _reglas[i] = r; else _reglas.Add(r);
                Escribir("reglas.json", _reglas);
            }
        }

        public bool BorrarRegla(string id)
        {
            lock (_lock)
            {
                bool ok = _reglas.RemoveAll(x => x.Id == id) > 0;
                if (ok) Escribir("reglas.json", _reglas);
                return ok;
            }
        }

        // ---------------------------------------------------------------- perfiles y ajustes
        public List<string> Perfiles() { lock (_lock) return _aj.Perfiles.ToList(); }
        public string PerfilActivo() { lock (_lock) return _aj.PerfilActivo; }
        public bool FotoAutomatica() { lock (_lock) return _aj.FotoAutomatica; }

        /// <summary>Cambia la lista de perfiles; si el activo desaparece, usa el primero.</summary>
        public void GuardarPerfiles(List<string> perfiles)
        {
            lock (_lock)
            {
                _aj.Perfiles = perfiles;
                if (!perfiles.Contains(_aj.PerfilActivo)) _aj.PerfilActivo = perfiles[0];
                Escribir("alarmas.json", _aj);
            }
        }

        public void FijarPerfil(string perfil) { lock (_lock) { if (_aj.Perfiles.Contains(perfil)) { _aj.PerfilActivo = perfil; Escribir("alarmas.json", _aj); } } }
        public void FijarFotoAutomatica(bool v) { lock (_lock) { _aj.FotoAutomatica = v; Escribir("alarmas.json", _aj); } }

        // ---------------------------------------------------------------- eventos
        /// <summary>Añade un evento al historial (máx. 500; borra las fotos de los que salen).</summary>
        public EventoRec AgregarEvento(EventoRec e)
        {
            lock (_lock)
            {
                e.Id = Math.Max(_ultimoId + 1, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
                _ultimoId = e.Id;
                _eventos.Insert(0, e);
                while (_eventos.Count > MaxEventos)
                {
                    var viejo = _eventos[_eventos.Count - 1];
                    _eventos.RemoveAt(_eventos.Count - 1);
                    BorrarFoto(viejo.Foto);
                }
                Escribir("eventos.json", _eventos);
                return e;
            }
        }

        /// <summary>Eventos más nuevos primero; con <paramref name="desde"/> solo los de Id mayor.</summary>
        public List<EventoRec> Eventos(long desde = 0) { lock (_lock) return _eventos.Where(e => e.Id > desde).ToList(); }

        public void BorrarEventos()
        {
            lock (_lock)
            {
                foreach (var e in _eventos) BorrarFoto(e.Foto);
                _eventos.Clear();
                Escribir("eventos.json", _eventos);
            }
        }

        private void BorrarFoto(string nombre)
        {
            if (string.IsNullOrEmpty(nombre)) return;
            try { File.Delete(Path.Combine(_snaps, Path.GetFileName(nombre))); } catch (Exception) { }
        }
    }
}
