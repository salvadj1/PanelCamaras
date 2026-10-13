using System;
using System.Collections.Concurrent;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Threading;
using System.Threading.Tasks;
using CentroSeguridad.Services.Xm;
using Microsoft.Extensions.Hosting;

namespace CentroSeguridad.Services.Alarmas
{
    /// <summary>
    /// Servicio en segundo plano que vigila las alarmas de las cámaras con "Vigilar" activado.
    /// Dos entradas: (1) una sesión DVRIP por cámara suscrita a alarmas (1500 → 1504), con reconexión
    /// progresiva 2…60 s; (2) un servidor TCP en el puerto 15002 por si la cámara empuja sus alarmas.
    /// Cada alarma pasa por <see cref="MotorReglas"/>.
    /// </summary>
    public class ServicioAlarmas : BackgroundService
    {
        public const int PuertoPush = 15002;
        private readonly AlmacenCamaras _camaras;
        private readonly MotorReglas _motor;
        private readonly EstadoCamaras _estado;
        private readonly ConcurrentDictionary<string, CancellationTokenSource> _vigilias = new ConcurrentDictionary<string, CancellationTokenSource>();
        private readonly ConcurrentDictionary<string, bool> _conectada = new ConcurrentDictionary<string, bool>();

        public ServicioAlarmas(AlmacenCamaras camaras, MotorReglas motor, EstadoCamaras estado)
        {
            _camaras = camaras; _motor = motor; _estado = estado;
        }

        /// <summary>¿Hay una sesión de alarmas abierta con esa cámara?</summary>
        public bool Vigilando(string id) => _conectada.TryGetValue(id, out bool v) && v;

        protected override async Task ExecuteAsync(CancellationToken stop)
        {
            _ = Task.Run(() => EscucharPush(stop), stop);
            while (!stop.IsCancellationRequested)
            {
                try { Conciliar(stop); await Task.Delay(5000, stop); }
                catch (OperationCanceledException) { break; }
                catch (Exception) { }
            }
            foreach (var v in _vigilias.Values) v.Cancel();
        }

        /// <summary>Arranca la vigilancia de las cámaras nuevas/activadas y detiene las borradas/desactivadas o cuyos datos cambiaron.</summary>
        private void Conciliar(CancellationToken stop)
        {
            var deben = _camaras.Listar().Where(c => c.Vigilar).ToDictionary(c => c.Id + "|" + c.Host + "|" + c.Puerto + "|" + c.Usuario + "|" + c.Password.GetHashCode(), c => c);
            foreach (var k in _vigilias.Keys.Where(k => !deben.ContainsKey(k)).ToList())
                if (_vigilias.TryRemove(k, out var cts)) { cts.Cancel(); _conectada.TryRemove(k.Split('|')[0], out _); }
            foreach (var kv in deben)
            {
                if (_vigilias.ContainsKey(kv.Key)) continue;
                var cts = CancellationTokenSource.CreateLinkedTokenSource(stop);
                if (_vigilias.TryAdd(kv.Key, cts)) { var cam = kv.Value; _ = Task.Run(() => Vigilar(cam, cts.Token)); }
            }
        }

        /// <summary>Mantiene una sesión por cámara, reconectando con espera creciente (2 s … 60 s).</summary>
        private async Task Vigilar(Models.CamaraXm cam, CancellationToken ct)
        {
            int espera = 2000;
            while (!ct.IsCancellationRequested)
            {
                try
                {
                    using (var c = new DvripClient(cam.Host, cam.Puerto))
                    {
                        c.Login(cam.Usuario, cam.Password);
                        using (c.Request(Msg.AlarmSub, new { Name = "", SessionID = "0x" + c.Session.ToString("X8") })) { }
                        c.SetReadTimeout(15000);
                        _conectada[cam.Id] = true; espera = 2000;
                        var ultimo = DateTime.UtcNow;
                        var cada = TimeSpan.FromSeconds(Math.Max(5, c.AliveIntervalSec / 2));
                        while (!ct.IsCancellationRequested)
                        {
                            DvripClient.Packet p = null;
                            // Se espera a que haya datos (sin leer a medias) y solo entonces se lee el paquete completo.
                            if (c.WaitReadable(5000)) p = c.ReadPacket();
                            if (p != null && p.MsgId == Msg.AlarmPush) await Despachar(cam, p);
                            if (DateTime.UtcNow - ultimo >= cada) { c.KeepAlive(); ultimo = DateTime.UtcNow; }
                        }
                    }
                }
                catch (Exception)
                {
                    _conectada[cam.Id] = false;
                    try { await Task.Delay(espera, ct); } catch (OperationCanceledException) { return; }
                    espera = Math.Min(espera * 2, 60000);
                }
            }
        }

        private async Task Despachar(Models.CamaraXm cam, DvripClient.Packet p)
        {
            using (var j = p.Json())
            {
                if (j == null) return;
                var ev = AlarmaEvento.Interpretar(j.RootElement);
                if (ev != null) { try { await _motor.ProcesarAsync(cam, ev); } catch (Exception) { } }
            }
        }

        /// <summary>Servidor de alarmas (puerto 15002): la cámara abre la conexión y envía cabecera XM + JSON.</summary>
        private async Task EscucharPush(CancellationToken stop)
        {
            TcpListener l = null;
            try
            {
                l = new TcpListener(IPAddress.Any, PuertoPush);
                l.Start();
                stop.Register(() => { try { l.Stop(); } catch (Exception) { } });
                while (!stop.IsCancellationRequested)
                {
                    var s = await l.AcceptTcpClientAsync();
                    _ = Task.Run(() => AtenderPush(s, stop));
                }
            }
            catch (Exception) { /* puerto ocupado o servicio detenido */ }
        }

        private async Task AtenderPush(TcpClient s, CancellationToken stop)
        {
            using (s)
            {
                try
                {
                    s.ReceiveTimeout = 10000;
                    string ip = ((IPEndPoint)s.Client.RemoteEndPoint).Address.ToString();
                    var stream = s.GetStream();
                    while (!stop.IsCancellationRequested)
                    {
                        var p = DvripClient.ReadFrom(stream);
                        var cam = _camaras.Listar().FirstOrDefault(c => c.Host == ip);
                        if (cam != null) await Despachar(cam, p);
                    }
                }
                catch (Exception) { /* fin de conexión */ }
            }
        }
    }
}
