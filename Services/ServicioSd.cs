using System;
using System.Collections.Concurrent;
using System.IO;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;
using CentroSeguridad.Services.Xm;

namespace CentroSeguridad.Services
{
    /// <summary>
    /// Acceso a las grabaciones de la tarjeta SD de una cámara: listado por día y descarga de clips en bruto
    /// (formato XM). Serializa las descargas por cámara (la cámara solo permite una a la vez) y respeta la
    /// cancelación de la petición HTTP para no dejar la cámara ocupada.
    /// </summary>
    public class ServicioSd
    {
        private readonly AlmacenCamaras _almacen;
        private readonly ConcurrentDictionary<string, SemaphoreSlim> _bloqueos = new ConcurrentDictionary<string, SemaphoreSlim>();

        public ServicioSd(AlmacenCamaras almacen) { _almacen = almacen; }

        /// <summary>Lista las grabaciones de un día; devuelve el array JSON de la cámara.</summary>
        public Task<string> ListarAsync(string id, DateTime dia)
        {
            var cam = _almacen.Obtener(id) ?? throw new InvalidOperationException("Cámara no encontrada");
            string d = dia.ToString("yyyy-MM-dd");
            return Task.Run(() =>
            {
                using (var c = new DvripClient(cam.Host, cam.Puerto, 8000))
                {
                    c.Login(cam.Usuario, cam.Password);
                    return c.QueryFilesRaw(d + " 00:00:00", d + " 23:59:59", cam.Canal);
                }
            });
        }

        /// <summary>
        /// Descarga un clip y lo escribe en <paramref name="salida"/> de forma asíncrona.
        /// Espera su turno si ya hay otra descarga de esa cámara; cancelar <paramref name="ct"/> la interrumpe.
        /// </summary>
        public async Task DescargarAsync(string id, string fichero, string begin, string end, long maxBytes, Stream salida, CancellationToken ct)
        {
            var cam = _almacen.Obtener(id) ?? throw new InvalidOperationException("Cámara no encontrada");
            var bloqueo = _bloqueos.GetOrAdd(id, _ => new SemaphoreSlim(1, 1));
            await bloqueo.WaitAsync(ct);
            try
            {
                var canal = Channel.CreateBounded<byte[]>(32);
                // Hilo productor: lee de la cámara y deja los bloques en el canal (con contrapresión).
                var productor = Task.Run(() =>
                {
                    try
                    {
                        using (var c = new DvripClient(cam.Host, cam.Puerto, 8000))
                        {
                            c.Login(cam.Usuario, cam.Password);
                            c.DescargarClip(fichero, begin, end, b =>
                            {
                                if (ct.IsCancellationRequested) return false;
                                try { canal.Writer.WriteAsync(b, ct).AsTask().GetAwaiter().GetResult(); return true; }
                                catch (OperationCanceledException) { return false; }
                            }, maxBytes);
                        }
                        canal.Writer.TryComplete();
                    }
                    catch (Exception e) { canal.Writer.TryComplete(e); }
                });
                try
                {
                    await foreach (var b in canal.Reader.ReadAllAsync(ct)) await salida.WriteAsync(b, 0, b.Length, ct);
                }
                finally { await productor.ContinueWith(_ => { }); }
            }
            finally { bloqueo.Release(); }
        }
    }
}
