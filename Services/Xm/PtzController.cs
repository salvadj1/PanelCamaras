using System;
using System.Collections.Generic;
using System.IO;
using System.Threading;
using System.Threading.Tasks;

namespace CentroSeguridad.Services.Xm
{
    /// <summary>
    /// Control PTZ fluido para un joystick (un controlador por cámara). Diferencias con una petición normal:
    ///  - Los comandos se envían SIN esperar la respuesta (nunca se bloquea esperando a la cámara).
    ///  - Si llegan órdenes más rápido de lo que se pueden enviar solo cuenta la ÚLTIMA (máx. ~16 mensajes/s).
    ///  - Una tarea descarta las respuestas entrantes y otra manda keepalives para que la cámara no cierre la sesión.
    ///  - Al soltar se paran TODOS los comandos usados en el gesto, dos veces por si un paquete se pierde.
    ///  - Seguridad "hombre muerto": si deja de llegar actividad mientras hay movimiento (p. ej. se perdió la orden de
    ///    parada de la web), la cámara se detiene sola tras <see cref="TiempoMuertoMs"/>.
    /// Usa su propia conexión: no compite con peticiones de presets, capturas o ajustes.
    /// </summary>
    public sealed class PtzController : IDisposable
    {
        private const int HuecoMinMs = 60;
        /// <summary>Milisegundos sin órdenes tras los que se para un movimiento en curso.</summary>
        public const int TiempoMuertoMs = 1800;

        private readonly string _host, _usuario, _password;
        private readonly int _puerto, _canal;
        private readonly object _lockPend = new object();
        private readonly object _lockConn = new object();
        private readonly AutoResetEvent _evento = new AutoResetEvent(false);
        private readonly HashSet<string> _usados = new HashSet<string>();
        private readonly Thread _hilo;

        private string _pendCmd;
        private int _pendStep;
        private bool _hayPend;
        private string _actualCmd;
        private int _actualStep;
        private DvripClient _cliente;
        private volatile bool _vivo;
        private volatile bool _cerrado;
        private long _ultimaActividad = Environment.TickCount64;

        /// <summary>true si hay un movimiento en curso (para no cerrar el controlador mientras se usa).</summary>
        public bool EnMovimiento => _actualCmd != null;
        /// <summary>Marca de tiempo (TickCount64) de la última orden recibida.</summary>
        public long UltimaActividad => Interlocked.Read(ref _ultimaActividad);

        public PtzController(string host, int puerto, string usuario, string password, int canal)
        {
            _host = host; _puerto = puerto; _usuario = usuario; _password = password; _canal = canal;
            _hilo = new Thread(Bucle) { IsBackground = true, Name = "PTZ " + host };
            _hilo.Start();
        }

        /// <summary>Abre la conexión por adelantado para que el primer movimiento sea inmediato.</summary>
        public void Calentar() { Task.Run(() => { try { lock (_lockConn) Asegurar(); } catch (Exception) { } }); }

        /// <summary>Movimiento deseado: <paramref name="cmd"/> = comando PTZ o null para parar; <paramref name="step"/> = velocidad 1..8.</summary>
        public void Set(string cmd, int step = 5)
        {
            Interlocked.Exchange(ref _ultimaActividad, Environment.TickCount64);
            lock (_lockPend) { _pendCmd = cmd; _pendStep = Math.Max(1, Math.Min(8, step)); _hayPend = true; }
            _evento.Set();
        }

        private void Bucle()
        {
            while (!_cerrado)
            {
                bool senal = _evento.WaitOne(500);
                if (_cerrado) break;
                string cmd; int step; bool hay;
                lock (_lockPend) { hay = _hayPend; cmd = _pendCmd; step = _pendStep; _hayPend = false; }

                if (!hay)
                {
                    // Hombre muerto: movimiento en curso sin noticias del navegador.
                    if (!senal && _actualCmd != null && Environment.TickCount64 - UltimaActividad > TiempoMuertoMs) { cmd = null; step = 0; hay = true; }
                    else continue;
                }
                try { Aplicar(cmd, step); } catch (Exception) { /* se reintenta con la siguiente orden */ }
                Thread.Sleep(HuecoMinMs);
            }
        }

        private void Aplicar(string cmd, int step)
        {
            lock (_lockConn)
            {
                try { Enviar(cmd, step); }
                catch (IOException) { Soltar(); Enviar(cmd, step); } // reconecta una vez
            }
        }

        private void Enviar(string cmd, int step)
        {
            var c = Asegurar();
            if (cmd == null)
            {
                if (_usados.Count > 0)
                {
                    for (int i = 0; i < 2; i++)
                    {
                        foreach (var u in _usados) c.PtzSend(u, _canal, stop: true);
                        if (i == 0) Thread.Sleep(80);
                    }
                    _usados.Clear();
                }
            }
            else if (cmd != _actualCmd || step != _actualStep)
            {
                // Cambiar de dirección o de velocidad = enviar el nuevo comando (sin parar entre medias: sin tirones).
                c.PtzSend(cmd, _canal, step);
                _usados.Add(cmd);
            }
            _actualCmd = cmd; _actualStep = step;
        }

        private DvripClient Asegurar()
        {
            var existente = _cliente;
            if (existente != null && _vivo) return existente;
            Soltar();
            var c = new DvripClient(_host, _puerto);
            try { c.Login(_usuario, _password); }
            catch (Exception) { c.Dispose(); throw; }
            c.SetReadTimeout(2000);
            _cliente = c; _vivo = true;
            Task.Run(() => Drenar(c));
            Task.Run(() => KeepAliveAsync(c));
            return c;
        }

        /// <summary>Lee y descarta lo que envíe la cámara (respuestas 1401...) para que su buffer no se llene.</summary>
        private void Drenar(DvripClient c)
        {
            try
            {
                while (ReferenceEquals(_cliente, c) && !_cerrado)
                {
                    if (!c.WaitReadable(2000)) continue;
                    c.ReadPacket();
                }
            }
            catch (Exception) { if (ReferenceEquals(_cliente, c)) _vivo = false; }
        }

        private async Task KeepAliveAsync(DvripClient c)
        {
            while (ReferenceEquals(_cliente, c) && _vivo && !_cerrado)
            {
                await Task.Delay(Math.Max(5, c.AliveIntervalSec / 2) * 1000).ConfigureAwait(false);
                try { c.KeepAlive(); } catch (Exception) { if (ReferenceEquals(_cliente, c)) _vivo = false; }
            }
        }

        private void Soltar()
        {
            try { _cliente?.Dispose(); } catch (Exception) { }
            _cliente = null; _vivo = false;
            _actualCmd = null; _actualStep = 0; // tras reconectar hay que volver a enviar el comando
        }

        /// <summary>Para cualquier movimiento pendiente y cierra la conexión.</summary>
        public void Dispose()
        {
            if (_cerrado) return;
            try { lock (_lockConn) { if (_cliente != null) Enviar(null, 0); } } catch (Exception) { }
            _cerrado = true;
            _evento.Set();
            lock (_lockConn) Soltar();
        }
    }
}
