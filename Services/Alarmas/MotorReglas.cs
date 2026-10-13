using System;
using System.Collections.Concurrent;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;

namespace CentroSeguridad.Services.Alarmas
{
    /// <summary>
    /// Motor de reglas. Recibe cada alarma, busca las reglas que encajan (cámara, evento, inicio/fin, horario,
    /// perfil, anti-spam) y ejecuta sus acciones en orden fijo: foto → PTZ → HTTP GET → aviso al navegador.
    /// Todos los eventos "Start" se guardan en el historial, haya o no reglas.
    /// </summary>
    public class MotorReglas
    {
        private static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromSeconds(6) };
        private readonly AlmacenReglas _reglas;
        private readonly AlmacenCamaras _camaras;
        private readonly PtzService _ptz;
        private readonly ConcurrentDictionary<string, long> _ultimaEjecucion = new ConcurrentDictionary<string, long>();

        public MotorReglas(AlmacenReglas reglas, AlmacenCamaras camaras, PtzService ptz)
        {
            _reglas = reglas; _camaras = camaras; _ptz = ptz;
        }

        /// <summary>¿La regla se aplica a este evento ahora? (sin contar el anti-spam). Función pura, reutilizable.</summary>
        public static bool Encaja(Regla r, string camaraId, AlarmaEvento ev, string perfil, DateTime ahora)
        {
            if (!r.Activa) return false;
            if (!string.IsNullOrEmpty(r.CamaraId) && r.CamaraId != camaraId) return false;
            if (!r.Eventos.Contains("*") && !r.Eventos.Contains(ev.Evento)) return false;
            if (r.SoloInicio && ev.Estado != "Start") return false;
            if (!string.IsNullOrEmpty(r.Perfil) && r.Perfil != perfil) return false;
            if (r.Desde >= 0 && r.Hasta >= 0)
            {
                int m = ahora.Hour * 60 + ahora.Minute;
                // Si la franja cruza la medianoche (22:00-07:00) se usa "o" en lugar de "y".
                bool dentro = r.Desde <= r.Hasta ? (m >= r.Desde && m < r.Hasta) : (m >= r.Desde || m < r.Hasta);
                if (!dentro) return false;
            }
            return true;
        }

        /// <summary>Procesa una alarma de la cámara <paramref name="cam"/>. Seguro de llamar desde cualquier hilo.</summary>
        public async Task ProcesarAsync(Models.CamaraXm cam, AlarmaEvento ev)
        {
            long ahora = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            string perfil = _reglas.PerfilActivo();
            var activas = _reglas.Reglas()
                .Where(r => Encaja(r, cam.Id, ev, perfil, DateTime.Now))
                .Where(r =>
                {
                    string clave = r.Id + "|" + cam.Id;
                    long ult = _ultimaEjecucion.TryGetValue(clave, out long u) ? u : 0;
                    bool ok = ahora - ult >= r.EsperaSeg * 1000L;
                    if (ok) _ultimaEjecucion[clave] = ahora;
                    return ok;
                }).ToList();
            var acciones = activas.SelectMany(r => r.Acciones).ToList();

            string foto = null;
            bool pideFoto = acciones.Any(a => a.Tipo == TipoAccion.Foto);
            // Foto automática en cada inicio de alarma (miniatura del historial), aunque ninguna regla la pida.
            if (pideFoto || (ev.Estado == "Start" && _reglas.FotoAutomatica())) foto = await TomarFotoAsync(cam);

            foreach (var a in acciones.Where(a => a.Tipo == TipoAccion.PtzPreset))
            {
                int.TryParse(a.Param, out int n);
                try { await _ptz.PresetAsync(cam.Id, Xm.PtzCmd.GotoPreset, n < 1 ? 1 : n); } catch (Exception) { }
            }
            foreach (var a in acciones.Where(a => a.Tipo == TipoAccion.HttpGet))
            {
                string url = Expandir(a.Param, cam, ev);
                if (!Uri.TryCreate(url, UriKind.Absolute, out var u) || (u.Scheme != "http" && u.Scheme != "https")) continue;
                try { using (await Http.GetAsync(u)) { } } catch (Exception) { }
            }
            if (ev.Estado == "Start")
            {
                _reglas.AgregarEvento(new EventoRec
                {
                    Hora = ahora, CamaraId = cam.Id, Camara = cam.Nombre, Evento = ev.Evento, Estado = ev.Estado,
                    Foto = foto, Notificar = acciones.Any(a => a.Tipo == TipoAccion.Notificar)
                });
            }
        }

        /// <summary>Descarga una captura de la cámara y la guarda en datos/snaps. Devuelve el nombre de archivo o null.</summary>
        private async Task<string> TomarFotoAsync(Models.CamaraXm cam)
        {
            try
            {
                byte[] b = await Http.GetByteArrayAsync(cam.SnapshotUrl());
                if (b.Length < 4 || b[0] != 0xFF || b[1] != 0xD8) return null;
                string nombre = cam.Id + "_" + DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + ".jpg";
                File.WriteAllBytes(Path.Combine(_reglas.CarpetaFotos, nombre), b);
                return nombre;
            }
            catch (Exception) { return null; }
        }

        /// <summary>Sustituye {camera} {event} {status} {time} {channel} en la URL (con codificación URL).</summary>
        public static string Expandir(string url, Models.CamaraXm cam, AlarmaEvento ev)
        {
            string E(string s) => Uri.EscapeDataString(s ?? "");
            return (url ?? "").Replace("{camera}", E(cam.Nombre)).Replace("{event}", E(ev.Evento))
                .Replace("{status}", E(ev.Estado)).Replace("{time}", E(ev.Hora)).Replace("{channel}", ev.Canal.ToString());
        }
    }
}
