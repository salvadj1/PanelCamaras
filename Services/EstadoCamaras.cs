using System;
using System.Collections.Concurrent;
using System.Linq;
using System.Net.Sockets;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Hosting;

namespace CentroSeguridad.Services
{
    /// <summary>
    /// Comprueba cada 4 s si cada cámara acepta conexiones TCP en su puerto XM
    /// (🟢 en línea · 🔴 sin conexión · ⚪ comprobando).
    /// </summary>
    public class EstadoCamaras : BackgroundService
    {
        private readonly AlmacenCamaras _almacen;
        private readonly ConcurrentDictionary<string, bool> _estado = new ConcurrentDictionary<string, bool>();

        public EstadoCamaras(AlmacenCamaras almacen) { _almacen = almacen; }

        /// <summary>true/false según la última comprobación, o null si aún no se ha comprobado.</summary>
        public bool? EsOnline(string id) => _estado.TryGetValue(id, out bool v) ? v : (bool?)null;

        protected override async Task ExecuteAsync(CancellationToken stop)
        {
            while (!stop.IsCancellationRequested)
            {
                try
                {
                    var camaras = _almacen.Listar();
                    var res = await Task.WhenAll(camaras.Select(async c => new { c.Id, Ok = await Sondear(c.Host, c.Puerto) }));
                    foreach (var r in res) _estado[r.Id] = r.Ok;
                    foreach (var k in _estado.Keys.Where(x => camaras.All(c => c.Id != x)).ToList()) _estado.TryRemove(k, out _);
                    await Task.Delay(4000, stop);
                }
                catch (OperationCanceledException) { break; }
                catch (Exception) { await Task.Delay(4000, stop).ContinueWith(_ => { }); }
            }
        }

        /// <summary>¿Acepta la cámara conexiones TCP en el puerto? Comprobación rápida (1,5 s).</summary>
        public static async Task<bool> Sondear(string host, int puerto, int timeoutMs = 1500)
        {
            using (var tcp = new TcpClient())
            {
                var t = tcp.ConnectAsync(host, puerto);
                var fin = await Task.WhenAny(t, Task.Delay(timeoutMs));
                if (fin == t && t.IsCompletedSuccessfully) return true;
                t.ContinueWith(x => { var _ = x.Exception; }, TaskContinuationOptions.OnlyOnFaulted);
                return false;
            }
        }
    }
}
