using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace CentroSeguridad.Services
{
    /// <summary>
    /// Convierte el RTSP de las cámaras en vídeo reproducible por el navegador (MSE por WebSocket) usando
    /// <c>go2rtc</c> (un único ejecutable). Arranca <c>go2rtc/go2rtc.exe</c> junto a la aplicación (lo descarga de
    /// GitHub la primera vez si falta), le genera la configuración con las cámaras y lo reinicia cuando cambian.
    /// go2rtc solo escucha en 127.0.0.1:1984; el navegador accede a través de <see cref="Go2RtcProxy"/>.
    /// </summary>
    public class Go2RtcService : BackgroundService
    {
        /// <summary>Puerto local de la API de go2rtc.</summary>
        public const int PuertoApi = 1984;
        private static readonly Regex NombreStream = new Regex("^([0-9a-f]{32})_(hd|sd)(_a)?$", RegexOptions.Compiled);

        private readonly AlmacenCamaras _almacen;
        private readonly ILogger<Go2RtcService> _log;
        private readonly SemaphoreSlim _cambio = new SemaphoreSlim(0);
        private readonly string _dir = Path.Combine(AppContext.BaseDirectory, "go2rtc");
        private Process _proceso;

        /// <summary>Ruta del ffmpeg que acompaña al programa (carpeta ffmpeg junto al exe), o null si falta.</summary>
        private static string RutaFfmpeg
        {
            get
            {
                string f = Path.Combine(AppContext.BaseDirectory, "ffmpeg", RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? "ffmpeg.exe" : "ffmpeg");
                return File.Exists(f) ? f : null;
            }
        }

        /// <summary>true si hay ffmpeg disponible (necesario para el audio en directo).</summary>
        public bool FfmpegDisponible => RutaFfmpeg != null;

        /// <summary>true cuando go2rtc está en marcha y se puede pedir vídeo.</summary>
        public bool Disponible { get; private set; }
        /// <summary>Estado en texto para mostrar al usuario.</summary>
        public string Mensaje { get; private set; } = "Iniciando…";

        public Go2RtcService(AlmacenCamaras almacen, ILogger<Go2RtcService> log)
        {
            _almacen = almacen; _log = log;
            _almacen.Cambio += () => { try { _cambio.Release(); } catch (Exception) { } };
            // Si la aplicación se cierra de golpe (ventana de consola, fin de proceso) no deja go2rtc abierto.
            AppDomain.CurrentDomain.ProcessExit += (s, e) => Detener();
        }

        /// <summary>
        /// Cierra los go2rtc.exe que sigan abiertos desde un arranque anterior y salgan de NUESTRA carpeta
        /// (un huérfano ocuparía el puerto 1984 y serviría una configuración antigua: "mse: stream not found").
        /// No toca go2rtc de otras rutas. Los fallos de permisos se ignoran.
        /// </summary>
        private void CerrarHuerfanos()
        {
            string exe = Path.GetFullPath(Exe);
            foreach (var p in Process.GetProcessesByName("go2rtc"))
            {
                try
                {
                    if (!string.Equals(p.MainModule.FileName, exe, StringComparison.OrdinalIgnoreCase)) continue;
                    p.Kill();
                    p.WaitForExit(3000);
                    _log.LogInformation("go2rtc huérfano cerrado (PID {Pid})", p.Id);
                }
                catch (Exception e) { _log.LogDebug("No se pudo revisar/cerrar un go2rtc: {Msg}", e.Message); }
                finally { p.Dispose(); }
            }
        }

        /// <summary>¿Es <paramref name="src"/> un nombre de stream válido de una cámara existente?</summary>
        public bool StreamValido(string src)
        {
            var m = NombreStream.Match(src ?? "");
            return m.Success && _almacen.Obtener(m.Groups[1].Value) != null;
        }

        private string Exe => Path.Combine(_dir, RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? "go2rtc.exe" : "go2rtc");

        protected override async Task ExecuteAsync(CancellationToken stop)
        {
            try
            {
                if (!await AsegurarBinario(stop)) return;
                while (!stop.IsCancellationRequested)
                {
                    CerrarHuerfanos();
                    EscribirConfig();
                    Iniciar();
                    using (var cts = CancellationTokenSource.CreateLinkedTokenSource(stop))
                    {
                        Task salida = _proceso.WaitForExitAsync(cts.Token);
                        Task cambio = _cambio.WaitAsync(cts.Token);
                        var primera = await Task.WhenAny(salida, cambio);
                        cts.Cancel();
                        Detener();
                        if (stop.IsCancellationRequested) break;
                        if (primera == salida)
                        {
                            Mensaje = "go2rtc se detuvo; reintentando…";
                            await Task.Delay(3000, stop);
                        }
                        else
                        {
                            while (_cambio.Wait(0)) { } // agrupa cambios seguidos
                            await Task.Delay(300, stop);
                        }
                    }
                }
            }
            catch (OperationCanceledException) { }
            catch (Exception e) { Mensaje = "Error: " + e.Message; _log.LogError(e, "go2rtc"); }
            finally { Detener(); }
        }

        /// <summary>Comprueba que existe el ejecutable; si no, lo descarga de GitHub (solo Windows x64).</summary>
        private async Task<bool> AsegurarBinario(CancellationToken stop)
        {
            if (File.Exists(Exe)) return true;
            Directory.CreateDirectory(_dir);
            if (!RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                Mensaje = "Falta go2rtc en la carpeta 'go2rtc' (descarga manual).";
                return false;
            }
            try
            {
                Mensaje = "Descargando go2rtc…";
                using (var http = new HttpClient { Timeout = TimeSpan.FromMinutes(2) })
                {
                    byte[] zip = await http.GetByteArrayAsync("https://github.com/AlexxIT/go2rtc/releases/latest/download/go2rtc_win64.zip", stop);
                    using (var a = new ZipArchive(new MemoryStream(zip)))
                    {
                        foreach (var e in a.Entries)
                        {
                            if (!e.FullName.EndsWith("go2rtc.exe", StringComparison.OrdinalIgnoreCase)) continue;
                            using (var o = File.Create(Exe)) using (var i = e.Open()) await i.CopyToAsync(o, stop);
                        }
                    }
                }
                if (File.Exists(Exe)) return true;
                Mensaje = "La descarga no contenía go2rtc.exe.";
            }
            catch (Exception e)
            {
                Mensaje = "No se pudo descargar go2rtc (" + e.Message + "). Copia go2rtc.exe en la carpeta 'go2rtc' junto al programa.";
            }
            return false;
        }

        /// <summary>Genera go2rtc.yaml con dos streams por cámara (HD/SD) y su variante con audio AAC (requiere ffmpeg).</summary>
        private void EscribirConfig()
        {
            var sb = new StringBuilder();
            sb.AppendLine("api:");
            sb.AppendLine("  listen: \"127.0.0.1:" + PuertoApi + "\"");
            sb.AppendLine("  origin: \"*\"");
            sb.AppendLine("rtsp:");
            sb.AppendLine("  listen: \"\"");
            sb.AppendLine("webrtc:");
            sb.AppendLine("  listen: \"\"");
            if (RutaFfmpeg != null)
            {
                // go2rtc usa este ffmpeg para pasar el audio a AAC (streams "_a").
                sb.AppendLine("ffmpeg:");
                sb.AppendLine("  bin: \"" + Yaml(RutaFfmpeg) + "\"");
            }
            sb.AppendLine("log:");
            sb.AppendLine("  level: warn");
            sb.AppendLine("streams:");
            foreach (var c in _almacen.Listar())
            {
                sb.AppendLine("  \"" + c.Id + "_hd\": \"" + Yaml(c.RtspUrl(0)) + "\"");
                sb.AppendLine("  \"" + c.Id + "_sd\": \"" + Yaml(c.RtspUrl(1)) + "\"");
                sb.AppendLine("  \"" + c.Id + "_hd_a\": \"ffmpeg:" + c.Id + "_hd#video=copy#audio=aac\"");
                sb.AppendLine("  \"" + c.Id + "_sd_a\": \"ffmpeg:" + c.Id + "_sd#video=copy#audio=aac\"");
            }
            File.WriteAllText(Path.Combine(_dir, "go2rtc.yaml"), sb.ToString());
        }

        private static string Yaml(string s) => s.Replace("\\", "\\\\").Replace("\"", "\\\"");

        private void Iniciar()
        {
            var psi = new ProcessStartInfo(Exe, "-config \"" + Path.Combine(_dir, "go2rtc.yaml") + "\"")
            {
                WorkingDirectory = _dir, UseShellExecute = false, CreateNoWindow = true,
                RedirectStandardOutput = true, RedirectStandardError = true
            };
            _proceso = Process.Start(psi);
            _proceso.OutputDataReceived += (s, e) => { if (!string.IsNullOrEmpty(e.Data)) _log.LogDebug("go2rtc: {Linea}", e.Data); };
            _proceso.ErrorDataReceived += (s, e) => { if (!string.IsNullOrEmpty(e.Data)) _log.LogDebug("go2rtc: {Linea}", e.Data); };
            _proceso.BeginOutputReadLine();
            _proceso.BeginErrorReadLine();
            Disponible = true;
            Mensaje = "En marcha";
        }

        private void Detener()
        {
            Disponible = false;
            try { if (_proceso != null && !_proceso.HasExited) _proceso.Kill(); } catch (Exception) { }
            try { _proceso?.Dispose(); } catch (Exception) { }
            _proceso = null;
        }
    }
}
