using System;
using System.Collections.Concurrent;
using System.Threading;
using System.Threading.Tasks;
using CentroSeguridad.Services.Xm;

namespace CentroSeguridad.Services
{
    /// <summary>
    /// Punto único de control de las cámaras desde la web: movimiento continuo (un <see cref="PtzController"/>
    /// por cámara, cerrado tras 60 s de inactividad) y órdenes puntuales (presets) con conexión propia.
    /// </summary>
    public class PtzService : IDisposable
    {
        private readonly AlmacenCamaras _almacen;
        private readonly ConcurrentDictionary<string, PtzController> _controladores = new ConcurrentDictionary<string, PtzController>();
        private readonly ConcurrentDictionary<string, long> _ultimaSecuencia = new ConcurrentDictionary<string, long>();
        private readonly Timer _limpieza;

        public PtzService(AlmacenCamaras almacen)
        {
            _almacen = almacen;
            _almacen.Cambio += CerrarHuerfanos;
            _limpieza = new Timer(_ => CerrarInactivos(), null, 30000, 30000);
        }

        /// <summary>
        /// Aplica un movimiento. <paramref name="cmd"/> null = parar. <paramref name="seq"/> crece con el tiempo en el
        /// navegador: las órdenes más antiguas que la última recibida se descartan (llegadas desordenadas).
        /// </summary>
        /// <returns>false si la cámara no existe.</returns>
        public bool Mover(string id, string cmd, int step, long seq)
        {
            var cam = _almacen.Obtener(id);
            if (cam == null) return false;
            long ultima = _ultimaSecuencia.GetOrAdd(id, 0);
            if (seq <= ultima) return true;
            _ultimaSecuencia[id] = seq;
            var ctl = _controladores.GetOrAdd(id, _ => new PtzController(cam.Host, cam.Puerto, cam.Usuario, cam.Password, cam.Canal));
            ctl.Set(cmd, step);
            return true;
        }

        /// <summary>Calienta la conexión PTZ de una cámara (al abrir su pantalla de directo).</summary>
        public void Calentar(string id)
        {
            var cam = _almacen.Obtener(id);
            if (cam == null) return;
            _controladores.GetOrAdd(id, _ => new PtzController(cam.Host, cam.Puerto, cam.Usuario, cam.Password, cam.Canal)).Calentar();
        }

        /// <summary>Ejecuta un preset (GotoPreset / SetPreset) con una conexión propia y corta.</summary>
        public Task PresetAsync(string id, string cmd, int n)
        {
            var cam = _almacen.Obtener(id) ?? throw new InvalidOperationException("Cámara no encontrada");
            return Task.Run(() =>
            {
                using (var c = new DvripClient(cam.Host, cam.Puerto))
                {
                    c.Login(cam.Usuario, cam.Password);
                    c.Ptz(cmd, cam.Canal, preset: n);
                }
            });
        }

        private void CerrarInactivos()
        {
            foreach (var kv in _controladores)
            {
                if (!kv.Value.EnMovimiento && Environment.TickCount64 - kv.Value.UltimaActividad > 60000 &&
                    _controladores.TryRemove(kv.Key, out var ctl)) ctl.Dispose();
            }
        }

        private void CerrarHuerfanos()
        {
            foreach (var kv in _controladores)
            {
                if (_almacen.Obtener(kv.Key) == null && _controladores.TryRemove(kv.Key, out var ctl)) ctl.Dispose();
            }
        }

        public void Dispose()
        {
            _limpieza.Dispose();
            foreach (var kv in _controladores) kv.Value.Dispose();
            _controladores.Clear();
        }
    }
}
